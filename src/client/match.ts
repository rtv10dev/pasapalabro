import { renderSVG } from "uqr";
import {
  MAX_NAME_LENGTH,
  parseServerMessage,
  PING,
  PING_MS,
  PLAYER_ROLES,
  ROLES,
  type Action,
  type DeviceKey,
  type Difficulty,
  type LetterResult,
  type MatchId,
  type MatchView,
  type MemberId,
  type PlayerRole,
  type PlayingView,
  type Rejection,
  type Results,
  type Role,
  type RoscoView,
  type Settings,
} from "../shared/protocol";
import { deviceKeyFor, rememberDeviceKey } from "./device-key";
import { h, replaceScreen, showStatus } from "./dom";
import { judgedSound } from "./judged-sound";
import { mirror, startCamera, stopCamera } from "./mirror";
import { rememberName, rememberedName } from "./remembered-name";
import { rememberShowAnswers, showsAnswers } from "./show-answers";
import { playSound, stopTicks, tickLastSeconds, unlockAudio } from "./sound";
import { wikcionarioUrl } from "./wikcionario";

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
  "not-started": "La partida aún no ha empezado.",
  "not-player": "Solo los jugadores pueden pulsar ¡Listo!.",
  "not-host": "Solo el Presentador de este turno puede hacer eso.",
  "turn-not-waiting": "El turno no está esperando a empezar.",
  "turn-not-running": "El turno no está en marcha.",
  "match-not-over": "La partida aún no ha terminado.",
  "already-rematched": "La revancha ya ha empezado.",
  "match-paused": "La partida está en pausa.",
  "match-abandoned": "La partida se ha abandonado.",
  "tally-showing": "Espera a que termine el marcador.",
};

const RESULT_LABELS: Record<LetterResult, string> = {
  pending: "pendiente",
  hit: "acierto",
  miss: "fallo",
};

/** How long to wait before following the Match again after losing it. */
const RECONNECT_MS = 2000;

/** How long the page can be hidden before its socket is no longer trusted. */
const STALE_MS = 5000;

const root = document.querySelector<HTMLElement>("#match");
/** The intervals counting down on screen; cleared on every new view. */
let intervals: number[] = [];
/**
 * Whether the waiting Player of a Hosted Match is following the other
 * Rosco instead of Espera tu turno; kept across views until Volver or until
 * their own Turn comes.
 */
let following = false;
/**
 * The view last rendered, to tell what the Host just judged; null after a
 * reload or a lost connection, so no sound replays.
 */
let previousView: MatchView | null = null;

export function followMatch(matchId: string): void {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const device = deviceKeyFor(matchId);
  const url = `${protocol}//${location.host}/api/matches/${matchId}/ws?device=${device}`;
  /** The socket following the Match; null while waiting to follow it again. */
  let socket: WebSocket | null = null;
  let retry = 0;
  const send: Send = (action) => {
    socket?.send(JSON.stringify(action));
  };

  // A locked phone or a Wi-Fi blip closes the socket. Following the Match
  // again with the same DeviceKey gives this Device its role back.
  const connect = (): void => {
    window.clearTimeout(retry);
    const opened = new WebSocket(url);
    socket = opened;
    previousView = null;
    opened.addEventListener("message", (event) => {
      receive(event, send, device, matchId);
    });
    opened.addEventListener("close", () => {
      if (socket !== opened) return;
      socket = null;
      // The Match pauses without this Device, whose Clock no longer counts.
      stopTicks();
      showStatus("Sin conexión. Reconectando…");
      // A hidden page doesn't ping, so the Match would drop it again: it
      // follows the Match again once back on screen.
      if (document.visibilityState === "hidden") return;
      retry = window.setTimeout(connect, RECONNECT_MS);
    });
  };
  // Pinging while on screen tells the Match this Device is still here; a
  // locked phone stops, and the Match notices even if the socket stays open.
  window.setInterval(() => {
    if (
      document.visibilityState === "visible" &&
      socket?.readyState === WebSocket.OPEN
    ) {
      socket.send(PING);
    }
  }, PING_MS);
  // ¡Listo! unlocks the audio; after a reload, the next tap anywhere does.
  document.addEventListener("click", unlockAudio);
  // Back online: no need to wait for the next try.
  window.addEventListener("online", () => {
    if (socket === null) connect();
  });
  // Back on screen: a socket left open while the phone was locked may be
  // dead without having closed, so a long absence replaces it.
  let hiddenAt: number | null = null;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      hiddenAt = Date.now();
      return;
    }
    const hiddenMs = hiddenAt === null ? 0 : Date.now() - hiddenAt;
    hiddenAt = null;
    if (socket && hiddenMs > STALE_MS) {
      const stale = socket;
      socket = null;
      stale.close();
    }
    if (socket === null) connect();
  });
  connect();
}

function receive(
  event: MessageEvent,
  send: Send,
  device: DeviceKey,
  matchId: MatchId,
): void {
  if (typeof event.data !== "string") return;
  const message = parseServerMessage(event.data);
  if (!message) return;
  if (message.type === "rejected") {
    showStatus(REJECTION_TEXTS[message.reason]);
    return;
  }
  const view = message.state;
  if (view.phase === "playing" && view.rematch !== null) {
    moveTo(view.rematch, device);
    return;
  }
  showStatus("");
  render(view, send, matchId);
  const sound = judgedSound(previousView, view);
  previousView = view;
  if (sound) playSound(sound);
  if (isYourClockRunning(view)) {
    tickLastSeconds(view.roscos[view.turn].clockMs);
  } else stopTicks();
}

/**
 * Follows the Rematch instead: this Device is already one of its Members
 * under the same key, so nobody joins again.
 */
function moveTo(rematch: MatchId, device: DeviceKey): void {
  rememberDeviceKey(rematch, device);
  location.replace(`/m/${rematch}`);
}

function render(view: MatchView, send: Send, matchId: MatchId): void {
  for (const interval of intervals) window.clearInterval(interval);
  intervals = [];
  if (root) replaceScreen(root, screen(view, send, matchId));
}

/** Whether this Device is the playing Player's, with their Clock running. */
function isYourClockRunning(view: MatchView): view is PlayingView {
  return (
    view.phase === "playing" &&
    view.stage === "running" &&
    view.pause === null &&
    view.you !== null &&
    view.roles[view.turn] === view.you
  );
}

function screen(view: MatchView, send: Send, matchId: MatchId): Node[] {
  switch (view.phase) {
    case "lobby":
      return lobby(view, send);
    case "started":
      return started(view, send);
    case "playing":
      return playing(view, send, matchId);
  }
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

/** What's typed in the join form, kept while the Lobby re-renders around it. */
let joinDraft: string | null = null;

function joinForm(send: Send): Node {
  const input = h("input", {
    name: "name",
    required: true,
    maxLength: MAX_NAME_LENGTH,
    enterKeyHint: "go",
    value: joinDraft ?? rememberedName(),
    oninput: () => {
      joinDraft = input.value;
    },
  });
  // Not in TypeScript's AutoFill type, though valid HTML.
  input.setAttribute("autocomplete", "nickname");
  return h(
    "form",
    {
      className: "stack",
      onsubmit: (event: SubmitEvent) => {
        event.preventDefault();
        rememberName(input.value);
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

function started(view: MatchView & { phase: "started" }, send: Send): Node[] {
  const yourRole = ROLES.find(
    (role) => view.you !== null && view.roles[role] === view.you,
  );
  const first = view.roles[view.firstPlayer];

  return [
    h("h1", {}, "¡Empieza la partida!"),
    h(
      "p",
      { className: "first" },
      "Empieza ",
      h("strong", {}, first === null ? "" : nameOf(view, first)),
      ` (${ROLE_LABELS[view.firstPlayer]})`,
    ),
    view.countdownMs === null
      ? readiness(view, yourRole, send)
      : countdown(view.countdownMs),
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

/** Before the countdown: who has pressed ¡Listo!, and the button for a Player who hasn't. */
function readiness(
  view: MatchView & { phase: "started" },
  yourRole: Role | undefined,
  send: Send,
): Node {
  const yourPlayerRole = PLAYER_ROLES.find((role) => role === yourRole);
  return h(
    "section",
    { className: "stack" },
    h(
      "ul",
      { className: "members" },
      ...PLAYER_ROLES.map((role) => {
        const member = view.roles[role];
        return h(
          "li",
          { className: view.ready[role] ? "" : "away" },
          `${member === null ? ROLE_LABELS[role] : nameOf(view, member)}: `,
          view.ready[role] ? "¡listo!" : "esperando…",
        );
      }),
    ),
    yourPlayerRole !== undefined &&
      !view.ready[yourPlayerRole] &&
      h(
        "button",
        {
          type: "button",
          onclick: () => {
            // Asked now, so the camera prompt doesn't interrupt the Turn.
            startCamera();
            send({ type: "ready" });
          },
        },
        "¡Listo!",
      ),
  );
}

/** Counts down to the first Turn; starts again from the time left on every new view. */
function countdown(ms: number): Node {
  const display = h("p", { className: "countdown" });
  ticking(display, ms, (left) => {
    const seconds = Math.ceil(left / 1000);
    return seconds > 0 ? String(seconds) : "¡A jugar!";
  });
  return display;
}

/**
 * Shows `format(left)` in the element, counting `ms` down on this Device's
 * own clock, until it reaches zero or the next view replaces it.
 */
function ticking(
  element: HTMLElement,
  ms: number,
  format: (left: number) => string,
): void {
  const endsAt = performance.now() + ms;
  const tick = (): void => {
    const left = Math.max(0, endsAt - performance.now());
    element.textContent = format(left);
    if (left === 0) window.clearInterval(interval);
  };
  const interval = window.setInterval(tick, 200);
  intervals.push(interval);
  tick();
}

/** A Turn being played, as this Device's role in it sees it. */
function playing(view: PlayingView, send: Send, matchId: MatchId): Node[] {
  const playerName = playerNameOf(view, view.turn);
  // The Pause screen hides a Tally, which comes back with the Turn.
  if (view.pause) return paused(view, view.pause);
  const nodes = turnScreen(view, playerName, send, matchId);
  return view.tallyShown ? [...nodes, tallyOverlay(view, send)] : nodes;
}

/** What this Device shows of the Turn, by its stage and this Device's role. */
function turnScreen(
  view: PlayingView,
  playerName: string,
  send: Send,
  matchId: MatchId,
): Node[] {
  const player = view.roles[view.turn];
  switch (view.stage) {
    case "abandoned":
      return abandoned();
    case "over":
      return over(view, send);
    case "handover":
      return handover(view, playerName);
    case "waiting":
    case "running":
      if (view.you === view.turnHost) return hostScreen(view, playerName, send);
      if (view.you === player) {
        following = false;
        return playerScreen(view);
      }
      if (PLAYER_ROLES.some((role) => view.roles[role] === view.you)) {
        return waitingScreen(view, playerName, matchId);
      }
      return [
        h("h1", {}, `Juega ${playerName}`),
        rosco(view.roscos[view.turn]),
      ];
  }
}

/**
 * The Host's screen: the Clue with its answer and the other answers they can
 * accept, the playing Player's Rosco and Clock, and the buttons that run the
 * Turn.
 */
function hostScreen(view: PlayingView, playerName: string, send: Send): Node[] {
  const { clue } = view;
  const button = (
    label: string,
    className: string,
    action: Action,
    disabled = false,
  ): Node =>
    h(
      "button",
      {
        type: "button",
        className,
        disabled,
        onclick: () => {
          send(action);
        },
      },
      label,
    );
  return [
    h("p", { className: "muted" }, `Presentas el turno de ${playerName}`),
    clock(view, view.turn),
    clue && clueCard(clue).card,
    view.stage === "waiting"
      ? h(
          "div",
          { className: "stack" },
          button("Empezar turno", "", { type: "begin-turn" }, view.tallyShown),
          view.settings.hosted &&
            button("Marcador", "secondary", { type: "show-tally" }),
        )
      : h(
          "div",
          { className: "verdicts" },
          button("Acierto", "hit", { type: "judge", verdict: "hit" }),
          button("Fallo", "miss", { type: "judge", verdict: "miss" }),
          button("Pasapalabra", "pasapalabra", {
            type: "judge",
            verdict: "pasapalabra",
          }),
        ),
    rosco(view.roscos[view.turn]),
  ].filter((node) => node !== null);
}

/**
 * The Clue with its letter, its answer and the other answers; `answers` are
 * the elements holding them, for a screen that can hide them.
 */
function clueCard(clue: NonNullable<PlayingView["clue"]>): {
  card: Node;
  answers: HTMLElement[];
} {
  const answers = [
    h(
      "p",
      { className: "answer" },
      "Respuesta: ",
      h("strong", {}, clue.answer),
    ),
  ];
  if (clue.otherAnswers.length > 0) {
    answers.push(
      h(
        "p",
        { className: "muted" },
        clue.otherAnswers.length === 1 ? "También vale: " : "También valen: ",
        clue.otherAnswers.join(", "),
      ),
    );
  }
  const card = h(
    "section",
    { className: "clue stack" },
    h(
      "p",
      { className: "rule" },
      clue.contains ? "Contiene la " : "Empieza por ",
      h("strong", { className: "letter" }, clue.letter),
    ),
    h("p", { className: "text" }, clue.text),
    ...answers,
  );
  return { card, answers };
}

/**
 * The waiting Player's screen: Espera tu turno, or ¡Se acabó el tiempo! once
 * their Clock has run out, until the other Player finishes; and, in a Hosted
 * Match, the button to follow the other Player's Rosco, with their Clock and
 * the Clue, its answers shown only with Mostrar respuestas. Both screens are
 * built and switched in place, so the Clock keeps counting from this view.
 */
function waitingScreen(
  view: PlayingView,
  playerName: string,
  matchId: MatchId,
): Node[] {
  const yours = PLAYER_ROLES.find((role) => view.roles[role] === view.you);
  const timeUp = yours !== undefined && view.roscos[yours].clockMs <= 0;
  const waiting = h(
    "section",
    { className: "stack" },
    h("h1", {}, timeUp ? "¡Se acabó el tiempo!" : "Espera tu turno"),
    h("p", { className: "muted" }, `Ahora juega ${playerName}.`),
  );
  if (!view.settings.hosted) return [waiting];
  const clue = view.clue && clueCard(view.clue);
  const answers = clue?.answers ?? [];
  const showAnswers = (on: boolean): void => {
    for (const answer of answers) answer.hidden = !on;
  };
  const toggle = h("input", {
    type: "checkbox",
    checked: showsAnswers(matchId),
    onchange: () => {
      rememberShowAnswers(matchId, toggle.checked);
      showAnswers(toggle.checked);
    },
  });
  showAnswers(toggle.checked);
  const follow = h(
    "section",
    { className: "stack" },
    h("p", { className: "muted" }, `Rosco de ${playerName}`),
    clock(view, view.turn),
    clue?.card ?? null,
    h("label", { className: "toggle" }, toggle, "Mostrar respuestas"),
    rosco(view.roscos[view.turn]),
  );
  const show = (on: boolean): void => {
    following = on;
    waiting.hidden = on;
    follow.hidden = !on;
  };
  waiting.append(
    h(
      "button",
      {
        type: "button",
        onclick: () => {
          show(true);
        },
      },
      `Ver el rosco de ${playerName}`,
    ),
  );
  follow.append(
    h(
      "button",
      {
        type: "button",
        className: "secondary",
        onclick: () => {
          show(false);
        },
      },
      "Volver",
    ),
  );
  show(following);
  return [waiting, follow];
}

/**
 * The playing Player's screen, the Mirror: their Rosco around their head on
 * the front camera, with their Clock and count, and the other Player's count
 * small; never the Clue.
 */
function playerScreen(view: PlayingView): Node[] {
  const yours = view.roscos[view.turn];
  const other = otherPlayer(view.turn);
  return [
    mirror(
      rosco(yours),
      h(
        "div",
        { className: "mirror-hud" },
        clock(view, view.turn),
        h(
          "div",
          { className: "counts" },
          count(yours),
          h(
            "p",
            { className: "other-count" },
            `${playerNameOf(view, other)}: `,
            count(view.roscos[other]),
          ),
        ),
      ),
      h(
        "p",
        { className: "mirror-prompt" },
        view.stage === "waiting"
          ? "¡Te toca!"
          : h("strong", { className: "letter" }, yours.current ?? ""),
      ),
    ),
  ];
}

/**
 * Between Turns: the answer to the Clue just missed, and who plays next,
 * unless it's the same Player because the other has finished; or, after a
 * Fallo that finished the Match, that answer before the end.
 */
function handover(view: PlayingView, nextName: string): Node[] {
  const ending = PLAYER_ROLES.every((role) => view.roscos[role].finished);
  const samePlayer = view.handoverFrom === view.turn;
  // A Miss stops the Clock with time left: at zero, it ran out.
  const timeUp =
    view.handoverFrom !== null && view.roscos[view.handoverFrom].clockMs <= 0;
  const display = h("p", { className: "countdown" });
  ticking(display, view.handoverMs ?? 0, (left) =>
    String(Math.ceil(left / 1000)),
  );
  return [
    h(
      "h1",
      {},
      timeUp
        ? "¡Se acabó el tiempo!"
        : ending
          ? "Último fallo"
          : samePlayer
            ? "Fallo"
            : "Cambio de turno",
    ),
    view.revealed &&
      h(
        "p",
        { className: "answer" },
        `La respuesta de la ${view.revealed.letter} era `,
        h("strong", {}, view.revealed.answer),
      ),
    !samePlayer &&
      h("p", { className: "first" }, "Ahora juega ", h("strong", {}, nextName)),
    display,
  ].filter((node) => node !== null && node !== false);
}

/**
 * A Device the Turn needs has dropped: who is missing, and how long until
 * the Match is abandoned.
 */
function paused(
  view: PlayingView,
  pause: NonNullable<PlayingView["pause"]>,
): Node[] {
  const display = h("p", { className: "countdown" });
  ticking(display, pause.abandonMs, (left) => String(Math.ceil(left / 1000)));
  const missing = pause.missing.map((id) => nameOf(view, id)).join(" y ");
  return [
    h("h1", {}, "Partida en pausa"),
    h("p", { className: "first" }, "Esperando a ", h("strong", {}, missing)),
    h(
      "p",
      { className: "muted" },
      "Si no vuelve a abrir la partida a tiempo, se abandona.",
    ),
    display,
  ];
}

/** A Pause lasted too long: the Match is over, with no Results. */
function abandoned(): Node[] {
  stopCamera();
  return [
    h("h1", {}, "Partida abandonada"),
    h(
      "p",
      { className: "muted" },
      "Alguien necesario para el turno estuvo desconectado más de 60 segundos.",
    ),
  ];
}

/**
 * Both Players have finished: the winner, each Player's Hits and Misses and
 * every Clue with its answer, and Revancha for the Creator.
 */
function over(view: PlayingView, send: Send): Node[] {
  stopCamera();
  const { results } = view;
  return [
    h("h1", {}, "¡Fin de la partida!"),
    results &&
      h(
        "p",
        { className: "first" },
        results.winner === null
          ? "¡Empate!"
          : h("strong", {}, `¡Gana ${playerNameOf(view, results.winner)}!`),
      ),
    view.you === view.creator
      ? h(
          "button",
          {
            type: "button",
            onclick: () => {
              send({ type: "rematch" });
            },
          },
          "Revancha",
        )
      : h(
          "p",
          { className: "muted" },
          `${nameOf(view, view.creator)} puede pedir la revancha.`,
        ),
    ...PLAYER_ROLES.map((role) =>
      h(
        "section",
        { className: "stack" },
        h("h2", {}, playerNameOf(view, role)),
        h("p", {}, count(view.roscos[role])),
        results && answers(results.clues[role]),
      ),
    ),
  ].filter((node) => node !== null);
}

/**
 * Every Clue of a Rosco with its answer, coloured by how the Player did; each
 * answer links to its Wikcionario entry.
 */
function answers(clues: Results["clues"][PlayerRole]): Node {
  return h(
    "ol",
    { className: "answers" },
    ...clues.map((clue) =>
      h(
        "li",
        { className: clue.result, title: RESULT_LABELS[clue.result] },
        h("strong", { className: "letter" }, clue.letter),
        h(
          "span",
          {},
          clue.contains ? "Contiene la " : "Empieza por ",
          `${clue.letter}: ${clue.text} `,
          h(
            "a",
            {
              href: wikcionarioUrl(clue.answer),
              target: "_blank",
              rel: "noopener",
              title: `${clue.answer} en Wikcionario`,
            },
            h("strong", {}, clue.answer),
          ),
        ),
      ),
    ),
  );
}

/** The Player's Clock, counting down on screen while it runs. */
function clock(view: PlayingView, role: PlayerRole): Node {
  const display = h("p", { className: "clock" });
  const { clockMs } = view.roscos[role];
  if (view.stage === "running" && role === view.turn) {
    ticking(display, clockMs, clockText);
  } else display.textContent = clockText(clockMs);
  return display;
}

function clockText(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** A Rosco's letters in a circle: Hits green, Misses red, the current one marked. */
function rosco(view: RoscoView): HTMLElement {
  const ring = h(
    "div",
    { className: "rosco" },
    ...view.letters.map(({ letter, result }, index) => {
      const current = letter === view.current ? " current" : "";
      const span = h(
        "span",
        { className: `${result}${current}`, title: RESULT_LABELS[result] },
        letter,
      );
      span.style.setProperty("--i", String(index));
      return span;
    }),
  );
  ring.style.setProperty("--n", String(view.letters.length));
  return ring;
}

/** The count of Hits and Misses. */
function count(view: RoscoView): Node {
  const letters = (result: LetterResult): number =>
    view.letters.filter((each) => each.result === result).length;
  return h(
    "span",
    { className: "count" },
    h("span", { className: "hit" }, `${letters("hit")} aciertos`),
    " · ",
    h("span", { className: "miss" }, `${letters("miss")} fallos`),
  );
}

/**
 * The Tally over whatever the Device shows, the Mirror included: each
 * Player's Hits, Misses and Clock, until the Host closes it.
 */
function tallyOverlay(view: PlayingView, send: Send): Node {
  return h(
    "section",
    { className: "tally stack", role: "dialog", ariaLabel: "Marcador" },
    h("h1", {}, "Marcador"),
    ...PLAYER_ROLES.map((role) =>
      h(
        "div",
        { className: "tally-player" },
        h("h2", {}, playerNameOf(view, role)),
        clock(view, role),
        h("p", {}, count(view.roscos[role])),
      ),
    ),
    view.you === view.turnHost &&
      h(
        "button",
        {
          type: "button",
          className: "secondary",
          onclick: () => {
            send({ type: "hide-tally" });
          },
        },
        "Cerrar",
      ),
  );
}

function otherPlayer(role: PlayerRole): PlayerRole {
  return role === "player1" ? "player2" : "player1";
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

/** The name of the Member playing the role, or the role's label if nobody is. */
function playerNameOf(view: MatchView, role: PlayerRole): string {
  const member = view.roles[role];
  return member === null ? ROLE_LABELS[role] : nameOf(view, member);
}

function nameOf(view: MatchView, id: MemberId): string {
  return view.members.find((member) => member.id === id)?.name ?? "";
}
