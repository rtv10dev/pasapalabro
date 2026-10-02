/**
 * Where the Mirror draws the Rosco: pure geometry, so it is tested without a
 * camera or a browser.
 */

export interface Size {
  width: number;
  height: number;
}

/** A face found in the camera image, in the image's own pixels. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The Rosco on the screen: its centre and outer diameter, in CSS pixels. */
export interface Placement {
  x: number;
  y: number;
  diameter: number;
}

/** How far above the face's centre the Rosco sits, as a share of the face's size: heads are taller than faces. */
const LIFT = 0.08;

/** The Rosco's diameter, as a multiple of the face's size. */
const SPREAD = 2;

/**
 * The smallest and largest diameter of the Rosco, as a share of the screen's
 * shorter side: big enough to read, small enough to fit.
 */
const MIN_DIAMETER = 0.6;
const MAX_DIAMETER = 1;

/** The Rosco around a face found in the camera image. */
export function placementAround(
  face: Box,
  video: Size,
  screen: Size,
): Placement {
  // The video fills the screen like CSS `object-fit: cover`: scaled until it
  // covers both sides, centred, the overflow cropped.
  const scale = Math.max(
    screen.width / video.width,
    screen.height / video.height,
  );
  const offsetX = (screen.width - video.width * scale) / 2;
  const offsetY = (screen.height - video.height * scale) / 2;
  const size = Math.max(face.width, face.height) * scale;
  const centreX = offsetX + (face.x + face.width / 2) * scale;
  const centreY = offsetY + (face.y + face.height / 2) * scale;
  const shorter = Math.min(screen.width, screen.height);
  const diameter = clamp(
    size * SPREAD,
    shorter * MIN_DIAMETER,
    shorter * MAX_DIAMETER,
  );
  const radius = diameter / 2;
  return {
    // Mirrored, as the video is shown.
    x: clamp(screen.width - centreX, radius, screen.width - radius),
    y: clamp(centreY - size * LIFT, radius, screen.height - radius),
    diameter,
  };
}

/** The Rosco's diameter with no face to follow, as a share of the screen's shorter side. */
const RESTING_DIAMETER = 0.9;

/** The Rosco with no face to follow: in the middle of the screen. */
export function restingPlacement(screen: Size): Placement {
  return {
    x: screen.width / 2,
    y: screen.height / 2,
    diameter: Math.min(screen.width, screen.height) * RESTING_DIAMETER,
  };
}

/**
 * How much of the way to the target the Rosco moves in one frame at 60 fps:
 * its position quickly, its size more slowly, as faces jitter more in size.
 */
const FOLLOW_POSITION = 0.35;
const FOLLOW_SIZE = 0.25;
const FRAME_MS = 1000 / 60;

/**
 * The Rosco after `elapsedMs` moving towards `target`, smoothed so it follows
 * the head without jittering; at `target` straight away if it wasn't shown.
 */
export function follow(
  current: Placement | null,
  target: Placement,
  elapsedMs: number,
): Placement {
  if (!current) return target;
  const frames = elapsedMs / FRAME_MS;
  // Moving a share of the way each frame compounds, whatever the frame rate.
  const position = 1 - (1 - FOLLOW_POSITION) ** frames;
  const size = 1 - (1 - FOLLOW_SIZE) ** frames;
  return {
    x: current.x + (target.x - current.x) * position,
    y: current.y + (target.y - current.y) * position,
    diameter: current.diameter + (target.diameter - current.diameter) * size,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
