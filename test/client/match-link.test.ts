import { describe, expect, it } from "vitest";
import { matchIdFromScan } from "../../src/client/match-link";

const ORIGIN = "https://pasapalabra.example";
const ID = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("matchIdFromScan", () => {
  it("reads the Match id from a Lobby's link", () => {
    expect(matchIdFromScan(`${ORIGIN}/m/${ID}`, ORIGIN)).toBe(ID);
  });

  it("ignores spaces around the scanned text", () => {
    expect(matchIdFromScan(` ${ORIGIN}/m/${ID}\n`, ORIGIN)).toBe(ID);
  });

  it("refuses a Match link of another site", () => {
    expect(matchIdFromScan(`https://other.example/m/${ID}`, ORIGIN)).toBeNull();
  });

  it("refuses the same host over another protocol", () => {
    expect(
      matchIdFromScan(`http://pasapalabra.example/m/${ID}`, ORIGIN),
    ).toBeNull();
  });

  it("refuses another path of this site", () => {
    expect(matchIdFromScan(`${ORIGIN}/`, ORIGIN)).toBeNull();
    expect(matchIdFromScan(`${ORIGIN}/creditos`, ORIGIN)).toBeNull();
    expect(matchIdFromScan(`${ORIGIN}/m/`, ORIGIN)).toBeNull();
    expect(matchIdFromScan(`${ORIGIN}/m/${ID}/extra`, ORIGIN)).toBeNull();
  });

  it("refuses text that isn't a link", () => {
    expect(matchIdFromScan("hola", ORIGIN)).toBeNull();
    expect(matchIdFromScan(`/m/${ID}`, ORIGIN)).toBeNull();
    expect(matchIdFromScan("", ORIGIN)).toBeNull();
  });
});
