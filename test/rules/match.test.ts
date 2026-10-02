import { describe, expect, it } from "vitest";
import {
  act,
  addRosco,
  missingRoscos,
  newMatch,
  nextChange,
  rematch,
  tick,
  viewFor,
  type Context,
  type MatchAction,
  type MatchState,
} from "../../src/rules/match";
import {
  ROLES,
  type DeviceKey,
  type MatchView,
  type Role,
  type Settings,
  type Verdict,
} from "../../src/shared/protocol";
import { LETTERS, type Rosco } from "../../src/shared/rosco";

const ANA = "00000000-0000-4000-8000-00000000000a";
const BEA = "00000000-0000-4000-8000-00000000000b";
const CARLOS = "00000000-0000-4000-8000-00000000000c";
const NOW = 1_000_000;
/** Everyone in these tests has the Match open, unless a test says otherwise. */
const CONTEXT: Context = {
  now: NOW,
  random: 0,
  connected: new Set([ANA, BEA, CARLOS]),
};

const UNHOSTED: Settings = {
  difficulty: "normal",
  clockSeconds: 180,
  hosted: false,
};
const HOSTED: Settings = { ...UNHOSTED, hosted: true };

const ROSCO: Rosco = LETTERS.map((letter) => ({
  letter,
  contains: false,
  text: `Definición de la ${letter}`,
  answer: `${letter}respuesta`,
  veryHard: false,
}));

/** A Match created with the given Roscos: both, unless a test says otherwise. */
function created(
  settings: Settings = UNHOSTED,
  roscos: Rosco[] = [ROSCO, ROSCO],
): MatchState {
  const result = newMatch(settings, { name: "Ana", device: ANA });
  if (!result.ok) throw new Error(`Rejected: ${result.reason}`);
  return roscos.reduce(
    (state, rosco) => addRosco(state, rosco, NOW),
    result.state,
  );
}

/** Applies an Action that must be accepted. */
function accepted(
  state: MatchState,
  device: DeviceKey,
  action: MatchAction,
  context: Context = CONTEXT,
): MatchState {
  const result = act(state, device, action, context);
  if (!result.ok) throw new Error(`Rejected: ${result.reason}`);
  return result.state;
}

/** Applies an Action that must be refused; returns why. */
function rejection(
  state: MatchState,
  device: DeviceKey,
  action: MatchAction,
  context: Context = CONTEXT,
): string {
  const result = act(state, device, action, context);
  if (result.ok) throw new Error("Accepted");
  return result.reason;
}

function memberNames(state: MatchState): string[] {
  return viewFor(state, ANA, CONTEXT).members.map((member) => member.name);
}

/** The Member id of the given Device, which must have joined. */
function idOf(state: MatchState, device: DeviceKey): number {
  const id = viewFor(state, device, CONTEXT).you;
  if (id === null) throw new Error("Not a Member");
  return id;
}

/** A Match whose Lobby Ana (the Creator), Bea and Carlos have joined. */
function lobbyOfThree(settings: Settings = UNHOSTED): MatchState {
  const withBea = accepted(created(settings), BEA, {
    type: "join",
    name: "Bea",
  });
  return accepted(withBea, CARLOS, { type: "join", name: "Carlos" });
}

/** Has the Creator assign each role to the Member on the given Device. */
function withRoles(
  state: MatchState,
  roles: Partial<Record<Role, DeviceKey>>,
): MatchState {
  let next = state;
  for (const role of ROLES) {
    const device = roles[role];
    if (device === undefined) continue;
    next = accepted(next, ANA, {
      type: "assign",
      role,
      member: idOf(next, device),
    });
  }
  return next;
}

function canStart(state: MatchState, context: Context = CONTEXT): boolean {
  const view = viewFor(state, ANA, context);
  if (view.phase !== "lobby") throw new Error(`In phase ${view.phase}`);
  return view.canStart;
}

describe("creating a Match", () => {
  it("opens a Lobby with the Creator as its only Member", () => {
    const view = viewFor(created(), ANA, CONTEXT);

    expect(view).toEqual({
      phase: "lobby",
      settings: UNHOSTED,
      members: [{ id: view.creator, name: "Ana", connected: true }],
      creator: view.you,
      roles: { host: null, player1: null, player2: null },
      you: view.creator,
      canStart: false,
    });
  });
});

describe("joining a Match", () => {
  it("makes the Device a Member under the name it typed", () => {
    const state = accepted(created(), BEA, { type: "join", name: "Bea" });

    const view = viewFor(state, BEA, CONTEXT);
    expect(memberNames(state)).toEqual(["Ana", "Bea"]);
    expect(view.members.find((member) => member.id === view.you)?.name).toBe(
      "Bea",
    );
  });

  it("happens once per Device", () => {
    const joined = accepted(created(), BEA, { type: "join", name: "Bea" });

    expect(rejection(joined, BEA, { type: "join", name: "Bea 2" })).toBe(
      "already-joined",
    );
  });
});

describe("a Member's connection", () => {
  it("shows when their Device has closed the Match", () => {
    const state = lobbyOfThree();

    const view = viewFor(state, ANA, {
      ...CONTEXT,
      connected: new Set([ANA, CARLOS]),
    });

    expect(view.members).toEqual([
      { id: idOf(state, ANA), name: "Ana", connected: true },
      { id: idOf(state, BEA), name: "Bea", connected: false },
      { id: idOf(state, CARLOS), name: "Carlos", connected: true },
    ]);
  });
});

describe("a Member's name", () => {
  it("is trimmed", () => {
    const state = accepted(created(), BEA, { type: "join", name: "  Bea \n" });

    expect(memberNames(state)).toEqual(["Ana", "Bea"]);
  });

  it("can't be blank", () => {
    expect(rejection(created(), BEA, { type: "join", name: "  " })).toBe(
      "invalid-name",
    );
  });

  it("can be up to 20 characters long", () => {
    const name = "B".repeat(20);

    const state = accepted(created(), BEA, { type: "join", name });

    expect(memberNames(state)).toEqual(["Ana", name]);
  });

  it("counts an emoji as one character", () => {
    const name = "B".repeat(19) + "👩‍👩‍👧";

    const state = accepted(created(), BEA, { type: "join", name });

    expect(memberNames(state)).toEqual(["Ana", name]);
  });

  it("can't be longer than 20 characters", () => {
    const name = "B".repeat(21);

    expect(rejection(created(), BEA, { type: "join", name })).toBe(
      "invalid-name",
    );
  });

  it("can't be another Member's name, whatever the case", () => {
    expect(rejection(created(), BEA, { type: "join", name: "ANA" })).toBe(
      "name-taken",
    );
  });

  it("can't be blank for the Creator either", () => {
    const result = newMatch(UNHOSTED, { name: "", device: ANA });

    expect(result).toEqual({ ok: false, reason: "invalid-name" });
  });
});

describe("assigning roles", () => {
  it("gives the role to the chosen Member", () => {
    const lobby = lobbyOfThree();
    const bea = idOf(lobby, BEA);

    const state = accepted(lobby, ANA, {
      type: "assign",
      role: "player1",
      member: bea,
    });

    expect(viewFor(state, CARLOS, CONTEXT).roles).toEqual({
      host: null,
      player1: bea,
      player2: null,
    });
  });

  it("is only for the Creator", () => {
    const lobby = lobbyOfThree();

    expect(
      rejection(lobby, BEA, {
        type: "assign",
        role: "player1",
        member: idOf(lobby, BEA),
      }),
    ).toBe("not-creator");
  });

  it("has a Host in a Hosted Match", () => {
    const lobby = lobbyOfThree(HOSTED);
    const carlos = idOf(lobby, CARLOS);

    const state = accepted(lobby, ANA, {
      type: "assign",
      role: "host",
      member: carlos,
    });

    expect(viewFor(state, ANA, CONTEXT).roles.host).toBe(carlos);
  });

  it("has no Host when the Match isn't Hosted", () => {
    const lobby = lobbyOfThree();

    expect(
      rejection(lobby, ANA, {
        type: "assign",
        role: "host",
        member: idOf(lobby, CARLOS),
      }),
    ).toBe("not-hosted");
  });

  it("is only among Members", () => {
    expect(
      rejection(lobbyOfThree(), ANA, {
        type: "assign",
        role: "player1",
        member: 999,
      }),
    ).toBe("unknown-member");
  });

  it("moves a Member who already had another role", () => {
    const lobby = lobbyOfThree();
    const bea = idOf(lobby, BEA);
    const asPlayer1 = accepted(lobby, ANA, {
      type: "assign",
      role: "player1",
      member: bea,
    });

    const state = accepted(asPlayer1, ANA, {
      type: "assign",
      role: "player2",
      member: bea,
    });

    expect(viewFor(state, ANA, CONTEXT).roles).toEqual({
      host: null,
      player1: null,
      player2: bea,
    });
  });

  it("can leave a role empty again", () => {
    const lobby = lobbyOfThree();
    const assigned = accepted(lobby, ANA, {
      type: "assign",
      role: "player1",
      member: idOf(lobby, BEA),
    });

    const state = accepted(assigned, ANA, {
      type: "assign",
      role: "player1",
      member: null,
    });

    expect(viewFor(state, ANA, CONTEXT).roles.player1).toBeNull();
  });
});

/** The default context, with Bea's Device gone. */
const WITHOUT_BEA: Context = { ...CONTEXT, connected: new Set([ANA, CARLOS]) };

/** A non-Hosted Lobby with Ana as Player 1 and Bea as Player 2. */
function playersAssigned(): MatchState {
  return withRoles(lobbyOfThree(), { player1: ANA, player2: BEA });
}

describe("Empezar", () => {
  it("is enabled once both Players are assigned", () => {
    const state = withRoles(lobbyOfThree(), { player1: ANA, player2: BEA });

    expect(canStart(state)).toBe(true);
  });

  it("is disabled while a Player is missing", () => {
    const state = withRoles(lobbyOfThree(), { player1: ANA });

    expect(canStart(state)).toBe(false);
  });

  it("is disabled in a Hosted Match until the Host is assigned too", () => {
    const state = withRoles(lobbyOfThree(HOSTED), {
      player1: ANA,
      player2: BEA,
    });

    expect(canStart(state)).toBe(false);
  });

  it("is disabled while someone with a role is disconnected", () => {
    expect(canStart(playersAssigned(), WITHOUT_BEA)).toBe(false);
  });

  it("doesn't wait for someone without a role", () => {
    const state = withRoles(lobbyOfThree(), { player1: ANA, player2: CARLOS });

    expect(canStart(state, WITHOUT_BEA)).toBe(true);
  });

  it("is enabled in a Hosted Match once all three roles are assigned", () => {
    const state = withRoles(lobbyOfThree(HOSTED), {
      host: CARLOS,
      player1: ANA,
      player2: BEA,
    });

    expect(canStart(state)).toBe(true);
  });
});

describe("the Roscos", () => {
  /** Ana and Bea as Players, in a Match the Stock had no Roscos for. */
  function waitingForRoscos(): MatchState {
    const state = accepted(created(UNHOSTED, []), BEA, {
      type: "join",
      name: "Bea",
    });
    return withRoles(state, { player1: ANA, player2: BEA });
  }

  it("don't hold Empezar back while they are being generated", () => {
    const state = waitingForRoscos();

    expect(canStart(state)).toBe(true);
  });

  it("hold the countdown back until they are generated, even with both Players ready", () => {
    const started = accepted(waitingForRoscos(), ANA, { type: "start" });
    const bothReady = accepted(accepted(started, ANA, { type: "ready" }), BEA, {
      type: "ready",
    });
    expect(viewFor(bothReady, BEA, CONTEXT)).toMatchObject({
      roscosReady: false,
      countdownMs: null,
    });

    const one = addRosco(bothReady, ROSCO, NOW + 1000);
    expect(viewFor(one, BEA, CONTEXT)).toMatchObject({ countdownMs: null });
    const both = addRosco(one, ROSCO, NOW + 7000);

    expect(viewFor(both, BEA, { ...CONTEXT, now: NOW + 8000 })).toMatchObject({
      roscosReady: true,
      countdownMs: 4000,
    });
  });

  it("never reach the Devices before the Match starts", () => {
    expect(JSON.stringify(viewFor(created(), ANA, CONTEXT))).not.toContain(
      "respuesta",
    );
  });
});

describe("starting the Match", () => {
  it("shows every Device the roles and who plays first", () => {
    const lobby = playersAssigned();

    const state = accepted(lobby, ANA, { type: "start" }, CONTEXT);

    expect(viewFor(state, CARLOS, CONTEXT)).toMatchObject({
      phase: "started",
      roles: {
        host: null,
        player1: idOf(lobby, ANA),
        player2: idOf(lobby, BEA),
      },
      firstPlayer: "player1",
    });
  });

  it("lets chance pick Player 2 to play first", () => {
    const state = accepted(
      playersAssigned(),
      ANA,
      { type: "start" },
      { ...CONTEXT, random: 0.99 },
    );

    expect(viewFor(state, ANA, CONTEXT)).toMatchObject({
      firstPlayer: "player2",
    });
  });

  it("is only for the Creator", () => {
    expect(rejection(playersAssigned(), BEA, { type: "start" })).toBe(
      "not-creator",
    );
  });

  it("needs every role assigned", () => {
    const state = withRoles(lobbyOfThree(HOSTED), {
      player1: ANA,
      player2: BEA,
    });

    expect(rejection(state, ANA, { type: "start" })).toBe("roles-missing");
  });

  it("needs everyone with a role connected", () => {
    expect(
      rejection(playersAssigned(), ANA, { type: "start" }, WITHOUT_BEA),
    ).toBe("member-disconnected");
  });

  it("closes the Lobby", () => {
    const state = accepted(playersAssigned(), ANA, { type: "start" });
    const late = "00000000-0000-4000-8000-00000000000d";

    expect(rejection(state, late, { type: "join", name: "Dani" })).toBe(
      "already-started",
    );
    expect(
      rejection(state, ANA, { type: "assign", role: "player1", member: null }),
    ).toBe("already-started");
    expect(rejection(state, ANA, { type: "start" })).toBe("already-started");
  });
});

describe("a Player being ready", () => {
  /** A started Match with Ana as Player 1, Bea as Player 2 and Carlos as Host. */
  function started(): MatchState {
    const state = withRoles(lobbyOfThree(HOSTED), {
      host: CARLOS,
      player1: ANA,
      player2: BEA,
    });
    return accepted(state, ANA, { type: "start" });
  }

  it("is awaited from both Players after Empezar, with no countdown yet", () => {
    expect(viewFor(started(), CARLOS, CONTEXT)).toMatchObject({
      phase: "started",
      ready: { player1: false, player2: false },
      countdownMs: null,
    });
  });

  it("shows on every Device", () => {
    const state = accepted(started(), BEA, { type: "ready" });

    expect(viewFor(state, CARLOS, CONTEXT)).toMatchObject({
      ready: { player1: false, player2: true },
      countdownMs: null,
    });
  });

  it("starts a 5 second countdown once both Players are", () => {
    const one = accepted(started(), BEA, { type: "ready" });
    const both = accepted(
      one,
      ANA,
      { type: "ready" },
      {
        ...CONTEXT,
        now: NOW + 3000,
      },
    );

    expect(viewFor(both, ANA, { ...CONTEXT, now: NOW + 3000 })).toMatchObject({
      ready: { player1: true, player2: true },
      countdownMs: 5000,
    });
    expect(viewFor(both, ANA, { ...CONTEXT, now: NOW + 5000 })).toMatchObject({
      countdownMs: 3000,
    });
    expect(viewFor(both, ANA, { ...CONTEXT, now: NOW + 8000 })).toMatchObject({
      phase: "playing",
    });
  });

  it("doesn't restart the countdown when pressed again", () => {
    const one = accepted(started(), BEA, { type: "ready" });
    const both = accepted(one, ANA, { type: "ready" });
    const again = accepted(
      both,
      ANA,
      { type: "ready" },
      {
        ...CONTEXT,
        now: NOW + 2000,
      },
    );

    expect(viewFor(again, ANA, { ...CONTEXT, now: NOW + 2000 })).toMatchObject({
      countdownMs: 3000,
    });
  });

  it("is only for the Players", () => {
    expect(rejection(started(), CARLOS, { type: "ready" })).toBe("not-player");
  });

  it("only happens after Empezar", () => {
    expect(rejection(playersAssigned(), ANA, { type: "ready" })).toBe(
      "not-started",
    );
  });
});

describe("removing a Member", () => {
  it("takes a disconnected Member out of the Match and their role", () => {
    const lobby = playersAssigned();

    const state = accepted(
      lobby,
      ANA,
      { type: "remove", member: idOf(lobby, BEA) },
      WITHOUT_BEA,
    );

    const view = viewFor(state, ANA, WITHOUT_BEA);
    expect(view.members.map((member) => member.name)).toEqual([
      "Ana",
      "Carlos",
    ]);
    expect(view.roles.player2).toBeNull();
  });

  it("lets their Device join again", () => {
    const lobby = playersAssigned();
    const removed = accepted(
      lobby,
      ANA,
      { type: "remove", member: idOf(lobby, BEA) },
      WITHOUT_BEA,
    );

    const state = accepted(removed, BEA, { type: "join", name: "Bea" });

    expect(memberNames(state)).toEqual(["Ana", "Carlos", "Bea"]);
  });

  it("never gives their id to someone who joins later", () => {
    const lobby = lobbyOfThree();
    const carlos = idOf(lobby, CARLOS);
    const removed = accepted(
      lobby,
      ANA,
      { type: "remove", member: carlos },
      { ...CONTEXT, connected: new Set([ANA, BEA]) },
    );
    const dani = "00000000-0000-4000-8000-00000000000d";

    const state = accepted(removed, dani, { type: "join", name: "Dani" });

    expect(idOf(state, dani)).not.toBe(carlos);
  });

  it("is only for someone who has closed the Match", () => {
    const lobby = playersAssigned();

    expect(
      rejection(lobby, ANA, { type: "remove", member: idOf(lobby, BEA) }),
    ).toBe("member-connected");
  });

  it("is only for the Creator", () => {
    const lobby = playersAssigned();

    expect(
      rejection(
        lobby,
        CARLOS,
        { type: "remove", member: idOf(lobby, BEA) },
        WITHOUT_BEA,
      ),
    ).toBe("not-creator");
  });

  it("is only among Members", () => {
    expect(
      rejection(playersAssigned(), ANA, { type: "remove", member: 999 }),
    ).toBe("unknown-member");
  });
});

/** When the countdown of a Match whose Players were both ready at NOW ends. */
const PLAY_STARTS = NOW + 5000;

/** The context at the given time, with everyone connected. */
function at(now: number): Context {
  return { ...CONTEXT, now };
}

/**
 * A Match past its countdown, with Ana as Player 1 (playing first), Bea as
 * Player 2 and, if Hosted, Carlos as Host.
 */
function playing(settings: Settings = UNHOSTED): MatchState {
  const roles = settings.hosted
    ? { host: CARLOS, player1: ANA, player2: BEA }
    : { player1: ANA, player2: BEA };
  const lobby = withRoles(lobbyOfThree(settings), roles);
  const started = accepted(lobby, ANA, { type: "start" });
  return accepted(accepted(started, ANA, { type: "ready" }), BEA, {
    type: "ready",
  });
}

function playingView(
  state: MatchState,
  device: DeviceKey,
  now: number,
): MatchView & { phase: "playing" } {
  const view = viewFor(state, device, at(now));
  if (view.phase !== "playing") throw new Error(`In phase ${view.phase}`);
  return view;
}

describe("the first Turn", () => {
  it("waits for Empezar turno once the countdown is over", () => {
    const state = playing();

    const view = playingView(state, CARLOS, PLAY_STARTS);

    expect(view).toMatchObject({
      turn: "player1",
      turnHost: idOf(state, BEA),
      stage: "waiting",
      handoverMs: null,
      revealed: null,
    });
    expect(view.roscos.player1).toMatchObject({
      current: "A",
      clockMs: 180_000,
      finished: false,
    });
    expect(
      view.roscos.player1.letters.every((each) => each.result === "pending"),
    ).toBe(true);
  });

  it("isn't there while the countdown runs", () => {
    expect(viewFor(playing(), ANA, at(PLAY_STARTS - 1)).phase).toBe("started");
  });
});

/** The first Turn of `playing()`, begun by its Host (Bea) at PLAY_STARTS. */
function turnBegun(settings: Settings = UNHOSTED): MatchState {
  const host = settings.hosted ? CARLOS : BEA;
  return accepted(
    playing(settings),
    host,
    { type: "begin-turn" },
    at(PLAY_STARTS),
  );
}

describe("Empezar turno", () => {
  it("starts the playing Player's Clock", () => {
    const state = turnBegun();

    const view = playingView(state, ANA, PLAY_STARTS + 10_000);
    expect(view.stage).toBe("running");
    expect(view.roscos.player1.clockMs).toBe(170_000);
    expect(view.roscos.player2.clockMs).toBe(180_000);
  });

  it("is only for the Host of the Turn", () => {
    expect(
      rejection(playing(), ANA, { type: "begin-turn" }, at(PLAY_STARTS)),
    ).toBe("not-host");
    expect(
      rejection(playing(HOSTED), BEA, { type: "begin-turn" }, at(PLAY_STARTS)),
    ).toBe("not-host");
  });

  it("is for the dedicated Host in a Hosted Match", () => {
    const view = playingView(turnBegun(HOSTED), ANA, PLAY_STARTS);

    expect(view).toMatchObject({ stage: "running", turnHost: view.roles.host });
  });

  it("can't be pressed during the countdown", () => {
    expect(
      rejection(playing(), BEA, { type: "begin-turn" }, at(PLAY_STARTS - 1)),
    ).toBe("turn-not-waiting");
  });

  it("can't be pressed again while the Clock runs", () => {
    expect(
      rejection(turnBegun(), BEA, { type: "begin-turn" }, at(PLAY_STARTS + 1)),
    ).toBe("turn-not-waiting");
  });
});

/** The results of a Player's letters, as a string: one character per letter, `.` pending, `h` Hit, `m` Miss. */
function resultsOf(
  view: MatchView & { phase: "playing" },
  role: "player1" | "player2",
): string {
  const codes = { pending: ".", hit: "h", miss: "m" } as const;
  return view.roscos[role].letters.map((each) => codes[each.result]).join("");
}

describe("Acierto", () => {
  it("turns the letter green and keeps the Turn, with the Clock running", () => {
    const state = accepted(
      turnBegun(),
      BEA,
      { type: "judge", verdict: "hit" },
      at(PLAY_STARTS + 4000),
    );

    const view = playingView(state, ANA, PLAY_STARTS + 6000);
    expect(view).toMatchObject({ turn: "player1", stage: "running" });
    expect(resultsOf(view, "player1")).toBe("h........................");
    expect(view.roscos.player1).toMatchObject({
      current: "B",
      clockMs: 174_000,
    });
  });

  it("is only for the Host of the Turn", () => {
    expect(
      rejection(
        turnBegun(),
        ANA,
        { type: "judge", verdict: "hit" },
        at(PLAY_STARTS + 1),
      ),
    ).toBe("not-host");
  });

  it("can't be pressed before Empezar turno", () => {
    expect(
      rejection(
        playing(),
        BEA,
        { type: "judge", verdict: "hit" },
        at(PLAY_STARTS),
      ),
    ).toBe("turn-not-running");
  });
});

/** When `turnBegun()`'s first verdict is given. */
const JUDGED = PLAY_STARTS + 4000;
/** When the Handover after that verdict ends. */
const HANDED_OVER = JUDGED + 5000;

function judged(
  state: MatchState,
  host: DeviceKey,
  verdict: Verdict,
  now: number,
): MatchState {
  return accepted(state, host, { type: "judge", verdict }, at(now));
}

describe("Fallo", () => {
  it("turns the letter red, stops the Clock and shows the answer to every Device", () => {
    const state = judged(turnBegun(), BEA, "miss", JUDGED);

    for (const device of [ANA, BEA, CARLOS]) {
      const view = playingView(state, device, JUDGED + 1000);
      expect(view).toMatchObject({
        stage: "handover",
        turn: "player2",
        handoverMs: 4000,
        revealed: { letter: "A", answer: "Arespuesta" },
      });
      expect(resultsOf(view, "player1")).toBe("m........................");
      expect(view.roscos.player1.clockMs).toBe(176_000);
    }
  });

  it("passes the Turn after the Handover, and the Player who just played becomes Host", () => {
    const state = judged(turnBegun(), BEA, "miss", JUDGED);

    const view = playingView(state, ANA, HANDED_OVER);
    expect(view).toMatchObject({
      stage: "waiting",
      turn: "player2",
      turnHost: idOf(state, ANA),
      handoverMs: null,
      revealed: null,
    });
    expect(view.roscos.player1.clockMs).toBe(176_000);
  });

  it("keeps the dedicated Host as Host of the next Turn in a Hosted Match", () => {
    const state = judged(turnBegun(HOSTED), CARLOS, "miss", JUDGED);

    expect(playingView(state, ANA, HANDED_OVER).turnHost).toBe(
      idOf(state, CARLOS),
    );
  });

  it("leaves no Turn to begin or judge during the Handover", () => {
    const state = judged(turnBegun(), BEA, "miss", JUDGED);

    expect(rejection(state, ANA, { type: "begin-turn" }, at(JUDGED + 1))).toBe(
      "turn-not-waiting",
    );
    expect(
      rejection(state, ANA, { type: "judge", verdict: "hit" }, at(JUDGED + 1)),
    ).toBe("turn-not-running");
  });
});

describe("Pasapalabra", () => {
  it("leaves the letter pending, stops the Clock and passes the Turn, revealing nothing", () => {
    const state = judged(turnBegun(), BEA, "pasapalabra", JUDGED);

    const view = playingView(state, ANA, JUDGED + 1000);
    expect(view).toMatchObject({
      stage: "handover",
      turn: "player2",
      revealed: null,
    });
    expect(resultsOf(view, "player1")).toBe(".........................");
    expect(view.roscos.player1).toMatchObject({
      current: "B",
      clockMs: 176_000,
    });
    expect(playingView(state, ANA, HANDED_OVER)).toMatchObject({
      stage: "waiting",
      turn: "player2",
    });
  });
});

/** Has the Host give each verdict in turn, one second apart from `from`. */
function verdicts(
  state: MatchState,
  host: DeviceKey,
  list: Verdict[],
  from: number,
): MatchState {
  return list.reduce(
    (next, verdict, index) => judged(next, host, verdict, from + index * 1000),
    state,
  );
}

describe("the letters", () => {
  it("lap back over the pending ones after the last", () => {
    // A is passed in Ana's first Turn; in her second she answers B to Z.
    const passed = judged(turnBegun(), BEA, "pasapalabra", JUDGED);
    const beasTurn = accepted(
      passed,
      ANA,
      { type: "begin-turn" },
      at(HANDED_OVER),
    );
    const backToAna = judged(beasTurn, ANA, "pasapalabra", HANDED_OVER + 1000);
    const anasTurn = accepted(
      backToAna,
      BEA,
      { type: "begin-turn" },
      at(HANDED_OVER + 6000),
    );

    const state = verdicts(
      anasTurn,
      BEA,
      Array<Verdict>(24).fill("hit"),
      HANDED_OVER + 6000,
    );

    const view = playingView(state, ANA, HANDED_OVER + 30_000);
    expect(resultsOf(view, "player1")).toBe(".hhhhhhhhhhhhhhhhhhhhhhhh");
    expect(view.roscos.player1.current).toBe("A");
    expect(view).toMatchObject({ stage: "running", turn: "player1" });
  });
});

/** When the Clock of `turnBegun()`'s Player runs out, if nothing stops it. */
const CLOCK_OUT = PLAY_STARTS + 180_000;

describe("a Player finishing", () => {
  it("happens when their Clock reaches zero, and the Turn passes after the Handover", () => {
    const state = turnBegun();

    const atZero = playingView(state, ANA, CLOCK_OUT);
    expect(atZero).toMatchObject({
      stage: "handover",
      turn: "player2",
      handoverMs: 5000,
      revealed: null,
    });
    expect(atZero.roscos.player1).toMatchObject({
      clockMs: 0,
      finished: true,
      current: null,
    });
    expect(playingView(state, ANA, CLOCK_OUT + 5000)).toMatchObject({
      stage: "waiting",
      turn: "player2",
    });
  });

  it("refuses a verdict that comes after their Clock reached zero", () => {
    expect(
      rejection(
        turnBegun(),
        BEA,
        { type: "judge", verdict: "hit" },
        at(CLOCK_OUT),
      ),
    ).toBe("turn-not-running");
  });

  it("happens when they have answered every letter, and the Turn passes", () => {
    const state = verdicts(
      turnBegun(),
      BEA,
      Array<Verdict>(25).fill("hit"),
      JUDGED,
    );

    const view = playingView(state, ANA, JUDGED + 25_000);
    expect(view).toMatchObject({
      stage: "handover",
      turn: "player2",
      revealed: null,
    });
    expect(view.roscos.player1).toMatchObject({
      finished: true,
      current: null,
      clockMs: 180_000 - 28_000,
    });
  });

  it("shows the answer when the last letter is a Miss", () => {
    const hits = Array<Verdict>(24).fill("hit");
    const state = verdicts(turnBegun(), BEA, [...hits, "miss"], JUDGED);

    const view = playingView(state, ANA, JUDGED + 25_000);
    expect(view).toMatchObject({
      stage: "handover",
      revealed: { letter: "Z" },
    });
    expect(view.roscos.player1.finished).toBe(true);
  });
});

describe("the Player left once the other has finished", () => {
  /** Ana's Clock ran out; Bea's Turn, judged by Ana, has just begun. */
  const BEA_BEGINS = CLOCK_OUT + 5000;
  function onlyBeaLeft(): MatchState {
    return accepted(turnBegun(), ANA, { type: "begin-turn" }, at(BEA_BEGINS));
  }

  it("plays on after a Fallo, with the Clock running", () => {
    const state = judged(onlyBeaLeft(), ANA, "miss", BEA_BEGINS + 1000);

    const view = playingView(state, BEA, BEA_BEGINS + 3000);
    expect(view).toMatchObject({
      stage: "running",
      turn: "player2",
      handoverMs: null,
    });
    expect(resultsOf(view, "player2")).toBe("m........................");
    expect(view.roscos.player2).toMatchObject({
      current: "B",
      clockMs: 177_000,
    });
  });

  it("plays on after a Pasapalabra, with the Clock running", () => {
    const state = judged(onlyBeaLeft(), ANA, "pasapalabra", BEA_BEGINS + 1000);

    const view = playingView(state, BEA, BEA_BEGINS + 3000);
    expect(view).toMatchObject({ stage: "running", turn: "player2" });
    expect(view.roscos.player2).toMatchObject({
      current: "B",
      clockMs: 177_000,
    });
  });

  it("shows every Device the answer of a Fallo that ends the Match, then ends it", () => {
    const hits = Array<Verdict>(24).fill("hit");
    const state = verdicts(
      onlyBeaLeft(),
      ANA,
      [...hits, "miss"],
      BEA_BEGINS + 1000,
    );
    const lastVerdict = BEA_BEGINS + 25_000;

    expect(playingView(state, BEA, lastVerdict)).toMatchObject({
      stage: "handover",
      revealed: { letter: "Z", answer: "Zrespuesta" },
    });
    expect(playingView(state, BEA, lastVerdict + 5000)).toMatchObject({
      stage: "over",
      revealed: null,
    });
  });

  it("ends the Match by finishing too", () => {
    const view = playingView(onlyBeaLeft(), ANA, BEA_BEGINS + 180_000);

    expect(view).toMatchObject({
      stage: "over",
      handoverMs: null,
      revealed: null,
      clue: null,
    });
    expect(view.roscos.player2.finished).toBe(true);
    expect(
      rejection(
        onlyBeaLeft(),
        ANA,
        { type: "begin-turn" },
        at(BEA_BEGINS + 180_000),
      ),
    ).toBe("turn-not-waiting");
  });
});

describe("the current Clue", () => {
  it("is shown to the Host of the Turn with its answer, before and after Empezar turno", () => {
    const clueA = {
      letter: "A",
      contains: false,
      text: "Definición de la A",
      answer: "Arespuesta",
    };

    expect(playingView(playing(), BEA, PLAY_STARTS).clue).toEqual(clueA);
    expect(playingView(turnBegun(), BEA, JUDGED).clue).toEqual(clueA);
  });

  it("follows the letters as they are answered", () => {
    const state = judged(turnBegun(), BEA, "hit", JUDGED);

    expect(playingView(state, BEA, JUDGED).clue).toMatchObject({
      letter: "B",
      answer: "Brespuesta",
    });
  });

  it("is the dedicated Host's in a Hosted Match", () => {
    expect(playingView(turnBegun(HOSTED), CARLOS, JUDGED).clue).toMatchObject({
      letter: "A",
    });
  });

  it("never reaches the playing Player or anyone else before it is revealed", () => {
    const hosted = turnBegun(HOSTED);
    const unhosted = turnBegun();
    const sent = [
      viewFor(playing(), ANA, at(PLAY_STARTS)),
      viewFor(unhosted, ANA, at(JUDGED)),
      viewFor(unhosted, CARLOS, at(JUDGED)),
      viewFor(hosted, ANA, at(JUDGED)),
      viewFor(hosted, BEA, at(JUDGED)),
      viewFor(judged(unhosted, BEA, "pasapalabra", JUDGED), BEA, at(JUDGED)),
    ];

    for (const view of sent) {
      expect(JSON.stringify(view)).not.toContain("Definición");
      expect(JSON.stringify(view)).not.toContain("respuesta");
    }
  });
});

describe("the next change time alone makes", () => {
  it("is the end of the countdown", () => {
    expect(nextChange(playing())).toBe(PLAY_STARTS);
  });

  it("is nothing while a Turn waits for Empezar turno", () => {
    expect(nextChange(tick(playing(), PLAY_STARTS))).toBeNull();
  });

  it("is the Clock reaching zero while it runs", () => {
    expect(nextChange(judged(turnBegun(), BEA, "hit", JUDGED))).toBe(CLOCK_OUT);
  });

  it("is the end of a Handover", () => {
    expect(nextChange(judged(turnBegun(), BEA, "miss", JUDGED))).toBe(
      HANDED_OVER,
    );
  });

  it("is nothing once the Match is over, or before Empezar", () => {
    const beaBegun = accepted(
      turnBegun(),
      ANA,
      { type: "begin-turn" },
      at(CLOCK_OUT + 5000),
    );
    const over = tick(beaBegun, CLOCK_OUT + 5000 + 180_000);
    expect(playingView(over, ANA, CLOCK_OUT + 5000 + 180_000).stage).toBe(
      "over",
    );

    expect(nextChange(over)).toBeNull();
    expect(nextChange(playersAssigned())).toBeNull();
  });
});

/**
 * A Match played out from `playing()`: one list of verdicts per Turn, in
 * order. Each Turn is begun by its Host one second after it is ready to
 * begin; if the verdicts leave it running, it runs until the Clock reaches
 * zero. Returns the state and the time once the last Turn has ended.
 */
function playedOut(
  turns: Verdict[][],
  settings: Settings = UNHOSTED,
): { state: MatchState; now: number } {
  let state = tick(playing(settings), PLAY_STARTS);
  let now = PLAY_STARTS;
  for (const turn of turns) {
    const host = deviceOf(state, playingView(state, ANA, now).turnHost);
    state = accepted(state, host, { type: "begin-turn" }, at(++now));
    state = verdicts(state, host, turn, ++now);
    now += turn.length * 1000;
    for (
      let next = nextChange(state);
      next !== null;
      next = nextChange(state)
    ) {
      now = Math.max(now, next);
      state = tick(state, now);
    }
  }
  return { state, now };
}

function deviceOf(state: MatchState, id: number): DeviceKey {
  const device = [ANA, BEA, CARLOS].find((each) => idOf(state, each) === id);
  if (!device) throw new Error(`No Device for Member ${id}`);
  return device;
}

describe("the results", () => {
  it("give the win to the Player with most Hits", () => {
    const { state, now } = playedOut([
      ["hit", "hit", "miss"],
      ["hit", "miss"],
      [],
      [],
    ]);

    const view = playingView(state, CARLOS, now);
    expect(view.stage).toBe("over");
    expect(view.results?.winner).toBe("player1");
  });

  it("break a tie on Hits by fewest Misses", () => {
    // Bea runs out of time with 1 Hit and no Misses; Ana then does too, with a Miss.
    const { state, now } = playedOut([["hit", "miss"], ["hit"], []]);

    expect(playingView(state, CARLOS, now).results?.winner).toBe("player2");
  });

  it("are a draw on equal Hits and Misses", () => {
    const { state, now } = playedOut([
      ["hit", "miss"],
      ["hit", "miss"],
      [],
      [],
    ]);

    expect(playingView(state, CARLOS, now).results).toMatchObject({
      winner: null,
    });
  });

  it("show every Device each Clue with its answer and result", () => {
    const { state, now } = playedOut([
      ["hit", "miss"],
      ["pasapalabra"],
      [],
      [],
    ]);

    for (const device of [ANA, BEA, CARLOS]) {
      const { results } = playingView(state, device, now);
      expect(results?.clues.player1.slice(0, 3)).toEqual([
        {
          letter: "A",
          contains: false,
          text: "Definición de la A",
          answer: "Arespuesta",
          result: "hit",
        },
        {
          letter: "B",
          contains: false,
          text: "Definición de la B",
          answer: "Brespuesta",
          result: "miss",
        },
        {
          letter: "C",
          contains: false,
          text: "Definición de la C",
          answer: "Crespuesta",
          result: "pending",
        },
      ]);
      expect(results?.clues.player2).toHaveLength(25);
    }
  });

  it("aren't there until both Players have finished", () => {
    const { state, now } = playedOut([["hit", "miss"], ["hit"]]);

    const view = playingView(state, ANA, now);
    expect(view.stage).toBe("waiting");
    expect(view.results).toBeNull();
    expect(JSON.stringify(view)).not.toContain("Arespuesta");
  });
});

/** A Match played to its end, Ana having played first. */
function over(settings: Settings = UNHOSTED): {
  state: MatchState;
  now: number;
} {
  return playedOut([["hit", "miss"], ["hit", "miss"], [], []], settings);
}

/** Has the Creator press Revancha once `over()` has ended; must be accepted. */
function rematched(settings: Settings = UNHOSTED): {
  before: MatchState;
  state: MatchState;
  rematchState: MatchState;
} {
  const { state: before, now } = over(settings);
  const result = rematch(before, ANA, "next", now);
  if (!result.ok) throw new Error(`Rejected: ${result.reason}`);
  return { before, ...result };
}

describe("Revancha", () => {
  it("points every Device of the Match to the new one", () => {
    const { state } = rematched();

    for (const device of [ANA, BEA, CARLOS]) {
      expect(viewFor(state, device, CONTEXT)).toMatchObject({
        phase: "playing",
        rematch: "next",
      });
    }
  });

  it("starts a new Match with the same settings, people and roles, the other Player first", () => {
    const { before, rematchState: next } = rematched(HOSTED);

    const previous = viewFor(before, BEA, CONTEXT);
    expect(viewFor(next, BEA, CONTEXT)).toEqual({
      phase: "started",
      settings: HOSTED,
      members: previous.members,
      creator: previous.creator,
      roles: previous.roles,
      you: previous.you,
      firstPlayer: "player2",
      ready: { player1: false, player2: false },
      roscosReady: false,
      countdownMs: null,
    });
  });

  it("gives the new Match two new Roscos to play, and nothing of the old one's play", () => {
    const { rematchState: next } = rematched();
    expect(missingRoscos(next)).toBe(2);

    const withRoscos = addRosco(addRosco(next, ROSCO, NOW), ROSCO, NOW);
    const ready = accepted(accepted(withRoscos, ANA, { type: "ready" }), BEA, {
      type: "ready",
    });
    const view = playingView(ready, ANA, PLAY_STARTS);
    expect(view).toMatchObject({ turn: "player2", stage: "waiting" });
    expect(resultsOf(view, "player1")).toBe(".........................");
    expect(view.roscos.player2.clockMs).toBe(180_000);
  });

  it("is only for the Creator", () => {
    const { state, now } = over();
    expect(rematch(state, BEA, "next", now)).toEqual({
      ok: false,
      reason: "not-creator",
    });
  });

  it("waits for the Match to be over", () => {
    const { state, now } = playedOut([["hit", "miss"]]);
    expect(rematch(state, ANA, "next", now)).toEqual({
      ok: false,
      reason: "match-not-over",
    });
  });

  it("happens once", () => {
    const { state } = rematched();
    expect(rematch(state, ANA, "another", NOW)).toEqual({
      ok: false,
      reason: "already-rematched",
    });
  });
});
