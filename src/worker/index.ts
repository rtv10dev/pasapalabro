export { Match } from "./match";

export default {
  fetch(request, env): Promise<Response> | Response {
    const { pathname } = new URL(request.url);

    if (request.method === "POST" && pathname === "/api/matches") {
      const id = env.MATCH.newUniqueId().toString();
      return Response.json({ id }, { status: 201 });
    }

    const socketRoute = /^\/api\/matches\/([^/]+)\/ws$/.exec(pathname);
    if (request.method === "GET" && socketRoute?.[1]) {
      const id = parseMatchId(env, socketRoute[1]);
      if (!id) return notFound();
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
        return new Response("Expected a WebSocket upgrade", { status: 426 });
      }
      return env.MATCH.get(id).fetch(request);
    }

    const pageRoute = /^\/m\/([^/]+)$/.exec(pathname);
    if (
      request.method === "GET" &&
      pageRoute?.[1] &&
      parseMatchId(env, pageRoute[1])
    ) {
      return env.ASSETS.fetch(new URL("/match", request.url));
    }

    return notFound();
  },
} satisfies ExportedHandler<Env>;

function parseMatchId(env: Env, id: string): DurableObjectId | null {
  try {
    return env.MATCH.idFromString(id);
  } catch {
    return null;
  }
}

function notFound(): Response {
  return new Response("Partida no encontrada", { status: 404 });
}
