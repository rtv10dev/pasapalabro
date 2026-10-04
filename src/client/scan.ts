import { h, showStatus } from "./dom";
import { matchIdFromScan } from "./match-link";

/** Decoding every frame would heat up the phone for nothing. */
const SCAN_INTERVAL_MS = 150;
/** Wide enough for a QR code across the room, small enough to decode fast. */
const MAX_FRAME_WIDTH = 640;

/**
 * Opens the back camera full screen and, once it sees the QR code of a Match
 * of this site, goes to that Match. On iPhone the system camera would open
 * the link in Safari, not in the installed app.
 */
export async function scanQr(): Promise<void> {
  const video = h("video", { muted: true, playsInline: true, autoplay: true });
  const message = h("p", { className: "scan-message", role: "status" });
  const cancel = h("button", {
    type: "button",
    className: "secondary",
    textContent: "Cancelar",
  });
  const screen = h(
    "div",
    { className: "scan" },
    video,
    h("div", { className: "scan-frame" }),
    message,
    cancel,
  );

  let stream: MediaStream | null = null;
  let frame = 0;
  const close = (): void => {
    cancelAnimationFrame(frame);
    for (const track of stream?.getTracks() ?? []) track.stop();
    screen.remove();
  };
  cancel.addEventListener("click", close);
  document.body.append(screen);
  message.textContent = "Apunta al código QR de la partida.";

  // The decoder downloads while the phone asks for the camera.
  const loading = import("jsqr");
  try {
    stream = await openBackCamera();
  } catch (error) {
    close();
    showStatus(cameraProblem(error));
    return;
  }
  if (!screen.isConnected) {
    // Cancelled while the phone asked for permission.
    close();
    return;
  }
  // Another app took the camera, or the phone closed it.
  for (const track of stream.getVideoTracks()) {
    track.addEventListener("ended", () => {
      close();
      showStatus("Se cerró la cámara.");
    });
  }
  video.srcObject = stream;
  void video.play().catch(() => undefined);

  let jsQR: (typeof import("jsqr"))["default"];
  try {
    jsQR = (await loading).default;
  } catch {
    close();
    showStatus("No se pudo cargar el lector de QR. Revisa la conexión.");
    return;
  }

  const canvas = h("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    close();
    showStatus("Este navegador no puede leer códigos QR.");
    return;
  }
  let lastScan = 0;
  const step = (now: number): void => {
    if (!screen.isConnected) return;
    frame = requestAnimationFrame(step);
    if (now - lastScan < SCAN_INTERVAL_MS) return;
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    if (video.videoWidth === 0) return;
    lastScan = now;

    const scale = Math.min(1, MAX_FRAME_WIDTH / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(image.data, image.width, image.height, {
      inversionAttempts: "dontInvert",
    });
    if (!code) return;

    const matchId = matchIdFromScan(code.data, location.origin);
    if (!matchId) {
      message.textContent = "Ese QR no es de una partida.";
      return;
    }
    close();
    location.assign(`/m/${matchId}`);
  };
  frame = requestAnimationFrame(step);
}

async function openBackCamera(): Promise<MediaStream> {
  if (!window.isSecureContext) throw new Error("The camera needs HTTPS");
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: "environment" } },
  });
}

function cameraProblem(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError") {
    return "Sin permiso para usar la cámara. Puedes darlo en los ajustes del navegador.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "Este dispositivo no tiene cámara.";
  }
  return "No se pudo abrir la cámara.";
}
