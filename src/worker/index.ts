import { parseCreateMatchRequest } from "../shared/protocol";

export { Match } from "./match";
export { RecentAnswers } from "./recent-answers";

export default {
  async fetch(request, env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (request.method === "POST" && pathname === "/api/matches") {
      return createMatch(request, env);
    }

    const socketRoute = /^\/api\/matches\/([^/]+)\/ws$/.exec(pathname);
    if (request.method === "GET" && socketRoute?.[1]) {
      const id = parseMatchId(env, socketRoute[1]);
      if (!id) return notFound();
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
        return new Response("Se esperaba un WebSocket", { status: 426 });
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

async function createMatch(request: Request, env: Env): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const parsed = parseCreateMatchRequest(body);
  if (!parsed) return badRequest("Datos de la partida no válidos");

  const id = env.MATCH.newUniqueId();
  const rejection = await env.MATCH.get(id).create(
    parsed.settings,
    parsed.creator,
  );
  if (rejection) return badRequest("Nombre no válido");
  return Response.json({ id: id.toString() }, { status: 201 });
}

function parseMatchId(env: Env, id: string): DurableObjectId | null {
  try {
    return env.MATCH.idFromString(id);
  } catch {
    return null;
  }
}

function badRequest(reason: string): Response {
  return new Response(reason, { status: 400 });
}

function notFound(): Response {
  return new Response("Partida no encontrada", { status: 404 });
}
