import { describe, expect, it } from "vitest";
import {
  createMatch,
  neverIssuedMatchId,
  newDeviceKey,
  postMatch,
  request,
  UNHOSTED,
} from "./helpers";

describe("POST /api/matches", () => {
  it("creates a Match and returns its id", async () => {
    const response = await postMatch({
      settings: UNHOSTED,
      creator: { name: "Ana", device: newDeviceKey() },
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: expect.any(String) });
  });

  it("returns a different id for each Match", async () => {
    const first = await createMatch();
    const second = await createMatch();

    expect(first.id).not.toBe(second.id);
  });

  it("returns 400 for settings the Creator can't choose", async () => {
    const response = await postMatch({
      settings: { ...UNHOSTED, clockSeconds: 60 },
      creator: { name: "Ana", device: newDeviceKey() },
    });

    expect(response.status).toBe(400);
  });

  it("returns 400 for a body that isn't JSON", async () => {
    const response = await request("/api/matches", {
      method: "POST",
      body: "not json",
    });

    expect(response.status).toBe(400);
  });

  it("returns 400 for a blank Creator name", async () => {
    const response = await postMatch({
      settings: UNHOSTED,
      creator: { name: " ", device: newDeviceKey() },
    });

    expect(response.status).toBe(400);
  });
});

describe("GET /m/<id>", () => {
  it("serves the Match page for an existing id", async () => {
    const { id } = await createMatch();

    const response = await request(`/m/${id}`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain("<title>Partida");
  });

  it("returns 404 for a malformed id", async () => {
    const response = await request("/m/not-a-match-id");

    expect(response.status).toBe(404);
  });

  it("returns 404 for an id that was never issued", async () => {
    const response = await request(`/m/${await neverIssuedMatchId()}`);

    expect(response.status).toBe(404);
  });
});

describe("unknown routes", () => {
  it("returns 404 under /api", async () => {
    const response = await request("/api/nothing-here");

    expect(response.status).toBe(404);
  });
});
