import type { FaceDetector } from "@mediapipe/tasks-vision";
import { h } from "./dom";
import {
  follow,
  restingPlacement,
  placementAround,
  type Box,
  type Placement,
} from "./mirror-geometry";

/**
 * The Mirror: the playing Player on their front camera, their Rosco around
 * their head. The camera image is only drawn on this phone and handed to the
 * face detector, which runs here too: no frame is ever sent anywhere.
 *
 * One per page, kept across views, so that the camera isn't reopened (and
 * permission asked again) every time the Match changes. It stays in the
 * page, only hidden between Turns: a playing <video> taken out and put back
 * can come back drawn at the wrong size on iPhone.
 */

/** Must match the version in package.json: the detector's WebAssembly comes from its CDN. */
const MEDIAPIPE_VERSION = "1.0.1";
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

/** How long the Rosco stays where the face was last seen before going back to the middle. */
const FACE_LOST_MS = 1000;

/**
 * "off" until first started; "stopped" once closed, or once the camera or
 * the face detector has failed: the Rosco shows on a plain background then.
 */
type CameraState = "off" | "starting" | "on" | "stopped";

let camera: CameraState = "off";
let stream: MediaStream | null = null;
let detector: FaceDetector | null = null;

const video = h("video", { muted: true, playsInline: true, autoplay: true });
video.setAttribute("aria-hidden", "true");
const overlay = h("div", { className: "mirror-overlay" });
const container = h("div", { className: "mirror plain" }, video, overlay);

/** Where the Rosco is drawn now; kept across views so it doesn't jump. */
let placement: Placement | null = null;
/** The face last found on the camera, in its pixels, and when. */
let lastFace: Box | null = null;
let lastFaceAt = -Infinity;
let lastVideoTime = -1;
let animationFrame = 0;

/**
 * Opens the front camera and loads the face detector, if not done yet.
 * Called when the Player presses ¡Listo!, so the permission prompt comes
 * before their Turn, and again when the Mirror is shown, after a reload.
 */
export function startCamera(): void {
  if (camera !== "off") return;
  setCamera("starting");
  void openCamera().catch(stopCamera);
}

/** Closes the camera, once the Player has no Turns left or it has failed. */
export function stopCamera(): void {
  stopTracks(stream);
  stream = null;
  detector?.close();
  detector = null;
  lastFace = null;
  video.srcObject = null;
  setCamera("stopped");
}

/**
 * Shows the Mirror: `rosco` follows the Player's head on the camera image,
 * with `hud` over it. Replaces any previous Rosco on it. The Mirror covers
 * the page from before <main>, so what comes after it in <main>, like the
 * Tally, shows over it; the screen gets an empty placeholder.
 */
export function mirror(rosco: HTMLElement, ...hud: Node[]): Node {
  startCamera();
  if (!container.isConnected) document.body.prepend(container);
  container.classList.remove("hidden");
  rosco.classList.add("following");
  overlay.replaceChildren(rosco, ...hud);
  if (video.paused && stream) void video.play().catch(() => undefined);
  window.cancelAnimationFrame(animationFrame);
  let last = performance.now();
  const step = (now: number): void => {
    place(rosco, now, now - last);
    last = now;
    animationFrame = window.requestAnimationFrame(step);
  };
  animationFrame = window.requestAnimationFrame(step);
  return document.createComment("Mirror");
}

/** Hides the Mirror until a screen shows it again; the camera stays open. */
export function hideMirror(): void {
  container.classList.add("hidden");
  window.cancelAnimationFrame(animationFrame);
}

function setCamera(state: CameraState): void {
  camera = state;
  container.classList.toggle("plain", state !== "on");
}

/**
 * Shows the camera as soon as it opens; the Rosco follows the head once the
 * detector, downloading meanwhile, has loaded.
 */
async function openCamera(): Promise<void> {
  if (!window.isSecureContext) throw new Error("The camera needs HTTPS");
  const loading = loadDetector();
  // Whatever happens to the camera, a detector loaded too late is let go.
  const release = (): void => {
    loading.then(
      (late) => {
        late.close();
      },
      () => undefined,
    );
  };
  let media: MediaStream;
  try {
    media = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: "user",
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
  } catch (error) {
    release();
    throw error;
  }
  if (camera !== "starting") {
    // Stopped while the Player answered the prompt.
    stopTracks(media);
    release();
    return;
  }
  stream = media;
  // Another app took the camera, or the phone closed it.
  for (const track of media.getVideoTracks()) {
    track.addEventListener("ended", stopCamera);
  }
  video.srcObject = media;
  setCamera("on");
  // Detached until the Mirror is shown; `autoplay` starts it then.
  void video.play().catch(() => undefined);
  const loaded = await loading;
  // Unless the camera was stopped while it loaded.
  if (stream === media) detector = loaded;
  else loaded.close();
}

/** MediaPipe's face detector, its code fetched only when a Mirror is first needed. */
async function loadDetector(): Promise<FaceDetector> {
  const { FaceDetector, FilesetResolver } =
    await import("@mediapipe/tasks-vision");
  const files = await FilesetResolver.forVisionTasks(WASM_URL);
  const create = (delegate: "GPU" | "CPU"): Promise<FaceDetector> =>
    FaceDetector.createFromOptions(files, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: "VIDEO",
      minDetectionConfidence: 0.5,
    });
  // Some phones have no usable GPU for it.
  return create("GPU").catch(() => create("CPU"));
}

function stopTracks(media: MediaStream | null): void {
  for (const track of media?.getTracks() ?? []) track.stop();
}

/** Moves the Rosco towards the face last seen on the camera. */
function place(rosco: HTMLElement, now: number, elapsedMs: number): void {
  const screen = {
    width: container.clientWidth,
    height: container.clientHeight,
  };
  detectFace(now);
  const target =
    lastFace && now - lastFaceAt <= FACE_LOST_MS
      ? placementAround(
          lastFace,
          { width: video.videoWidth, height: video.videoHeight },
          screen,
        )
      : restingPlacement(screen);
  placement = follow(placement, target, elapsedMs);
  rosco.style.left = `${placement.x - placement.diameter / 2}px`;
  rosco.style.top = `${placement.y - placement.diameter / 2}px`;
  rosco.style.setProperty("--size", `${placement.diameter}px`);
}

/** Looks for a face in the camera frame shown now, if it is a new one. */
function detectFace(now: number): void {
  if (!detector || video.readyState < 2) return;
  if (video.currentTime === lastVideoTime) return;
  lastVideoTime = video.currentTime;
  let box;
  try {
    box = detector.detectForVideo(video, now).detections[0]?.boundingBox;
  } catch {
    stopCamera();
    return;
  }
  if (!box) return;
  lastFaceAt = now;
  lastFace = {
    x: box.originX,
    y: box.originY,
    width: box.width,
    height: box.height,
  };
}
