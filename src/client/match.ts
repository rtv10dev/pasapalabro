import { renderSVG } from "uqr";
import {
  MAX_NAME_LENGTH,
  parseServerMessage,
  ROLES,
  type Action,
  type Difficulty,
  type MatchView,
  type MemberId,
  type Rejection,
  type Role,
  type Settings,
} from "../shared/protocol";
import { deviceKeyFor } from "./device-key";
import { h, showStatus } from "./dom";

type Send = (action: Action) => void;

const ROLE_LABELS: Record<Role, string> = {
  host: "Presentador",
  player1: "Jugador 1",
  player2: "Jugador 2",
};

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: "Fácil",
  normal: "Normal",
  hard: "Difícil",
};

const REJECTION_TEXTS: Record<Rejection, string> = {
  "invalid-action": "No se ha podido hacer eso.",
  "invalid-name": `Escribe un nombre de hasta ${MAX_NAME_LENGTH} caracteres.`,
  "name-taken": "Ese nombre ya está en la partida. Prueba con otro.",
  "already-joined": "Ya estás en la partida.",
  "not-creator": "Solo el Creador puede hacer eso.",
  "already-started": "La partida ya ha empezado.",
  "not-hosted": "Esta partida no tiene Presentador.",
  "unknown-member": "Esa persona ya no está en la partida.",
  "roles-missing": "Faltan roles por asignar.",
  "member-disconnected": "Alguien con un rol se ha desconectado.",
  "member-connected": "Solo puedes quitar a quien se ha desconectado.",
};

const root = document.querySelector<HTMLElement>("#match");
let countdownInterval: number | undefined;

export function followMatch(matchId: string): void {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const device = deviceKeyFor(matchId);
  const socket = new WebSocket(
    `${protocol}//${location.host}/api/matches/${matchId}/ws?device=${device}`,
  );
  const send: Send = (action) => {
    socket.send(JSON.stringify(action));
  };

  socket.addEventListener("message", (event) => {
    if (typeof event.data !== "string") return;
    const message = parseServerMessage(event.data);
    if (!message) return;
    if (message.type === "rejected") {
      showStatus(REJECTION_TEXTS[message.reason]);
      return;
    }
    showStatus("");
    render(message.state, send);
  });

  socket.addEventListener("close", () => {
    showStatus("Desconectado. Recarga la página para volver.");
  });
}

function render(view: MatchView, send: Send): void {
  window.clearInterval(countdownInterval);
  root?.replaceChildren(
    ...(view.phase === "lobby" ? lobby(view, send) : started(view)),
  );
}

function lobby(view: MatchView & { phase: "lobby" }, send: Send): Node[] {
  const isCreator = view.you === view.creator;
  return [
    h("h1", {}, "Sala de espera"),
    h("p", { className: "muted" }, settingsSummary(view.settings)),
    share(),
    view.you === null && joinForm(send),
    h(
      "section",
      { className: "stack" },
      h("h2", {}, "Roles"),
      ...rolesOf(view.settings).map((role) =>
        isCreator ? roleSelect(view, role, send) : roleLine(view, role),
      ),
    ),
    h(
      "section",
      {},
      h("h2", {}, "En la sala"),
      h(
        "ul",
        { className: "members" },
        ...view.members.map((member) =>
          h(
            "li",
            { className: member.connected ? "" : "away" },
            member.name,
            member.id === view.creator && " · Creador",
            member.id === view.you && " (tú)",
            !member.connected && " · desconectado",
            isCreator &&
              !member.connected &&
              h(
                "button",
                {
                  type: "button",
                  className: "secondary small",
                  onclick: () => {
                    send({ type: "remove", member: member.id });
                  },
                },
                "Quitar",
              ),
          ),
        ),
      ),
    ),
    isCreator
      ? h(
          "button",
          {
            type: "button",
            disabled: !view.canStart,
            onclick: () => {
              send({ type: "start" });
            },
          },
          "Empezar",
        )
      : h(
          "p",
          { className: "muted" },
          `Esperando a que ${nameOf(view, view.creator)} pulse Empezar.`,
        ),
  ].filter((node) => node !== false);
}

function share(): Node {
  const link = `${location.origin}${location.pathname}`;
  const qr = renderSVG(link, { border: 2 });
  return h(
    "section",
    { className: "share stack" },
    h("img", {
      className: "qr",
      src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr)}`,
      alt: "Código QR de la partida",
    }),
    h("a", { href: link, className: "link" }, link),
    window.isSecureContext &&
      h(
        "button",
        {
          type: "button",
          className: "secondary",
          onclick: () => {
            void navigator.clipboard.writeText(link).then(() => {
              showStatus("Enlace copiado.");
            });
          },
        },
        "Copiar enlace",
      ),
  );
}

function joinForm(send: Send): Node {
  const input = h("input", {
    name: "name",
    required: true,
    maxLength: MAX_NAME_LENGTH,
    enterKeyHint: "go",
  });
  // Not in TypeScript's AutoFill type, though valid HTML.
  input.setAttribute("autocomplete", "nickname");
  return h(
    "form",
    {
      className: "stack",
      onsubmit: (event: SubmitEvent) => {
        event.preventDefault();
        send({ type: "join", name: input.value });
      },
    },
    h("label", { className: "field" }, "Tu nombre", input),
    h("button", { type: "submit" }, "Unirme"),
  );
}

function roleSelect(view: MatchView, role: Role, send: Send): Node {
  const select = h(
    "select",
    {
      onchange: () => {
        send({
          type: "assign",
          role,
          member: select.value === "" ? null : Number(select.value),
        });
      },
    },
    h("option", { value: "" }, "Sin asignar"),
    ...view.members.map((member) =>
      h("option", { value: String(member.id) }, member.name),
    ),
  );
  select.value = String(view.roles[role] ?? "");
  return h("label", { className: "field" }, ROLE_LABELS[role], select);
}

function roleLine(view: MatchView, role: Role): Node {
  const member = view.roles[role];
  return h(
    "p",
    { className: "role" },
    `${ROLE_LABELS[role]}: `,
    h("strong", {}, member === null ? "sin asignar" : nameOf(view, member)),
  );
}

function started(view: MatchView & { phase: "started" }): Node[] {
  const yourRole = ROLES.find(
    (role) => view.you !== null && view.roles[role] === view.you,
  );
  const first = view.roles[view.firstPlayer];
  const countdown = h("p", { className: "countdown" });
  const endsAt = performance.now() + view.countdownMs;
  const tick = (): void => {
    const seconds = Math.ceil((endsAt - performance.now()) / 1000);
    countdown.textContent = seconds > 0 ? String(seconds) : "¡A jugar!";
    if (seconds <= 0) window.clearInterval(countdownInterval);
  };
  tick();
  countdownInterval = window.setInterval(tick, 200);

  return [
    h("h1", {}, "¡Empieza la partida!"),
    h(
      "p",
      { className: "first" },
      "Empieza ",
      h("strong", {}, first === null ? "" : nameOf(view, first)),
      ` (${ROLE_LABELS[view.firstPlayer]})`,
    ),
    countdown,
    h(
      "section",
      { className: "stack" },
      ...rolesOf(view.settings).map((role) => roleLine(view, role)),
    ),
    h(
      "p",
      { className: "muted" },
      yourRole
        ? `Tu rol: ${ROLE_LABELS[yourRole]}`
        : "Estás mirando la partida.",
    ),
  ];
}

function rolesOf(settings: Settings): readonly Role[] {
  return settings.hosted ? ROLES : ["player1", "player2"];
}

function settingsSummary({
  difficulty,
  clockSeconds,
  hosted,
}: Settings): string {
  return [
    DIFFICULTY_LABELS[difficulty],
    `${clockSeconds / 60} min por jugador`,
    hosted ? "con Presentador" : "sin Presentador",
  ].join(" · ");
}

function nameOf(view: MatchView, id: MemberId): string {
  return view.members.find((member) => member.id === id)?.name ?? "";
}
