import {
  parseCreatedMatch,
  parseStateMessage,
  type MatchState,
} from "../shared/protocol";

const status = document.querySelector<HTMLElement>("#status");

function showStatus(text: string): void {
  if (status) status.textContent = text;
}

function setUpHome(): void {
  const create = document.querySelector<HTMLButtonElement>("#create");
  create?.addEventListener("click", () => {
    create.disabled = true;
    void createMatch().then((id) => {
      if (id) {
        location.assign(`/m/${id}`);
        return;
      }
      showStatus("No se pudo crear la partida. Inténtalo de nuevo.");
      create.disabled = false;
    });
  });
}

async function createMatch(): Promise<string | null> {
  try {
    const response = await fetch("/api/matches", { method: "POST" });
    if (!response.ok) return null;
    return parseCreatedMatch(await response.json())?.id ?? null;
  } catch {
    return null;
  }
}

function render(state: MatchState): void {
  showStatus(`Dispositivos conectados: ${state.devices}`);
}

function followMatch(matchId: string): void {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(
    `${protocol}//${location.host}/api/matches/${matchId}/ws`,
  );

  socket.addEventListener("message", (event) => {
    if (typeof event.data !== "string") return;
    const message = parseStateMessage(event.data);
    if (message) render(message.state);
  });

  socket.addEventListener("close", () => {
    showStatus("Desconectado. Recarga la página para volver.");
  });
}

const matchPath = /^\/m\/([^/]+)$/.exec(location.pathname);
if (matchPath?.[1]) followMatch(matchPath[1]);
else setUpHome();
