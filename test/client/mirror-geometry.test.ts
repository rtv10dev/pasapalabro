import { describe, expect, it } from "vitest";
import {
  follow,
  restingPlacement,
  placementAround,
} from "../../src/client/mirror-geometry";

/** A portrait phone screen, in CSS pixels. */
const PHONE = { width: 400, height: 800 };

describe("placementAround", () => {
  it("circles the face, a little above its centre, twice its size", () => {
    const face = { x: 125, y: 300, width: 150, height: 150 };
    expect(placementAround(face, PHONE, PHONE)).toEqual({
      x: 200,
      y: 363,
      diameter: 300,
    });
  });

  it("mirrors the image, like looking in a mirror", () => {
    const leftOfTheImage = { x: 100, y: 300, width: 150, height: 150 };
    expect(placementAround(leftOfTheImage, PHONE, PHONE).x).toBe(225);
  });

  it("follows the image as it is scaled and cropped to cover the screen", () => {
    // 640×480 scaled by 800/480 to 1066⅔×800, a third cropped off each side.
    const landscape = { width: 640, height: 480 };
    const centred = { x: 260, y: 180, width: 120, height: 120 };
    const placement = placementAround(centred, landscape, PHONE);
    expect(placement.x).toBeCloseTo(200);
    expect(placement.y).toBeCloseTo(384);
    expect(placement.diameter).toBeCloseTo(400);
  });

  it("keeps the letters readable when the face is far away", () => {
    const far = { x: 190, y: 390, width: 20, height: 20 };
    expect(placementAround(far, PHONE, PHONE).diameter).toBe(240);
  });

  it("keeps the Rosco within the screen's width when the face is close", () => {
    const close = { x: 50, y: 250, width: 300, height: 300 };
    expect(placementAround(close, PHONE, PHONE).diameter).toBe(400);
  });

  it("keeps every letter on screen when the face is at an edge", () => {
    const corner = { x: 0, y: 0, width: 150, height: 150 };
    expect(placementAround(corner, PHONE, PHONE)).toEqual({
      x: 250,
      y: 150,
      diameter: 300,
    });
  });
});

describe("restingPlacement", () => {
  it("centres the Rosco on the screen, nearly as wide as it", () => {
    expect(restingPlacement(PHONE)).toEqual({ x: 200, y: 400, diameter: 360 });
  });
});

describe("follow", () => {
  const FRAME_MS = 1000 / 60;
  const from = { x: 0, y: 0, diameter: 100 };
  const to = { x: 100, y: 100, diameter: 200 };

  it("starts where the target is", () => {
    expect(follow(null, to, FRAME_MS)).toEqual(to);
  });

  it("moves part of the way each frame, so the Rosco doesn't jitter", () => {
    const placement = follow(from, to, FRAME_MS);
    expect(placement.x).toBeCloseTo(35);
    expect(placement.y).toBeCloseTo(35);
    expect(placement.diameter).toBeCloseTo(125);
  });

  it("moves as far over one slow frame as over two quick ones", () => {
    const placement = follow(from, to, 2 * FRAME_MS);
    expect(placement.x).toBeCloseTo(57.75);
    expect(placement.y).toBeCloseTo(57.75);
    expect(placement.diameter).toBeCloseTo(143.75);
  });
});
