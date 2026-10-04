import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const BASE = "https://pasapalabra.test";

/** Fetches a static file, as the Worker's assets serve it. */
function asset(path: string): Promise<Response> {
  return env.ASSETS.fetch(`${BASE}${path}`);
}

async function manifest(): Promise<Record<string, unknown>> {
  const response = await asset("/manifest.webmanifest");
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("manifest+json");
  const body: unknown = await response.json();
  expect(body).toBeTypeOf("object");
  return { ...(body as object) };
}

describe("the web app manifest", () => {
  it("names the app, in Spanish, opening full screen at the home page", async () => {
    expect(await manifest()).toMatchObject({
      name: "Pasapalabra",
      short_name: "Pasapalabra",
      lang: "es",
      start_url: "/",
      scope: "/",
      display: "standalone",
      background_color: expect.stringMatching(/^#[0-9a-f]{6}$/),
      theme_color: expect.stringMatching(/^#[0-9a-f]{6}$/),
    });
  });

  it("lists the icons Android needs, each one served", async () => {
    const icons = (await manifest()).icons;
    expect(icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sizes: "192x192", type: "image/png" }),
        expect.objectContaining({ sizes: "512x512", type: "image/png" }),
        expect.objectContaining({
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        }),
        expect.objectContaining({ sizes: "any", type: "image/svg+xml" }),
      ]),
    );
    for (const icon of icons as { src: string; type: string }[]) {
      const response = await asset(icon.src);
      expect(response.status, icon.src).toBe(200);
      expect(response.headers.get("content-type"), icon.src).toContain(
        icon.type,
      );
    }
  });
});

describe("the apple-touch-icon", () => {
  it("is served, as a PNG", async () => {
    const response = await asset("/icons/apple-touch-icon.png");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/png");
  });
});

describe.each(["/", "/match", "/creditos"])("the page %s", (path) => {
  async function head(): Promise<string> {
    const response = await asset(path);
    expect(response.status).toBe(200);
    return /<head>([\s\S]*)<\/head>/.exec(await response.text())?.[1] ?? "";
  }

  it("links the manifest and the icons", async () => {
    const html = await head();

    expect(html).toMatch(
      /<link\s+rel="manifest"\s+href="\/manifest\.webmanifest"/,
    );
    expect(html).toMatch(/<link\s+rel="icon"\s+href="\/icons\/icon\.svg"/);
    expect(html).toMatch(
      /<link\s+rel="apple-touch-icon"\s+href="\/icons\/apple-touch-icon\.png"/,
    );
  });

  it("tells iOS the app's name and to open full screen", async () => {
    const html = await head();

    expect(html).toMatch(
      /<meta\s+name="apple-mobile-web-app-capable"\s+content="yes"/,
    );
    expect(html).toMatch(
      /<meta\s+name="apple-mobile-web-app-title"\s+content="Pasapalabra"/,
    );
  });
});
