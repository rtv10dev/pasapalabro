import { describe, expect, it } from "vitest";
import {
  act,
  devicesChanged,
  newMatch,
  newMatchRefusal,
  nextChange,
  rematch,
  rematchRefusal,
  silent,
  tick,
  viewFor,
  type Context,
  type MatchAction,
  type MatchRoscos,
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
}));

/** A Rosco that shares no answer with ROSCO, so both can be in one Match. */
const OTHER_ROSCO: Rosco = ROSCO.map((clue) => ({
  ...clue,
  answer: `${clue.letter}otrarespuesta`,
}));

/** Both Roscos with two other answers for every Clue. */
const WITH_OTHERS: MatchRoscos = [withOthers(ROSCO), withOthers(OTHER_ROSCO)];

function withOthers(rosco: Rosco): Rosco {
  return rosco.map((clue) => ({
    ...clue,
    otherAnswers: [`${clue.letter}alternativa`, `${clue.letter}sinónimo`],
  }));
}

/** A Match created with the given Roscos. */
function created(
  settings: Settings = UNHOSTED,
  roscos: MatchRoscos = [ROSCO, OTHER_ROSCO],
): MatchState {
  const result = newMatch(settings, { name: "Ana", device: ANA }, roscos);
  if (!result.ok) throw new Error(`Rejected: ${result.reason}`);
  return result.state;
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
function lobbyOfThree(
  settings: Settings = UNHOSTED,
  roscos?: MatchRoscos,
): MatchState {
  const withBea = accepted(created(settings, roscos), BEA, {
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

  it("can be refused or not before its Roscos are drawn", () => {
    expect(newMatchRefusal({ name: "Ana", device: ANA })).toBeNull();
    expect(newMatchRefusal({ name: "", device: ANA })).toBe("invalid-name");
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
    const result = newMatch(UNHOSTED, { name: "", device: ANA }, [
      ROSCO,
      OTHER_ROSCO,
    ]);

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
  it("are there from the start: the countdown begins once both Players are ready", () => {
    const lobby = withRoles(
      accepted(created(), BEA, { type: "join", name: "Bea" }),
      { player1: ANA, player2: BEA },
    );
    const started = accepted(lobby, ANA, { type: "start" });
    const bothReady = accepted(accepted(started, ANA, { type: "ready" }), BEA, {
      type: "ready",
    });

    expect(viewFor(bothReady, BEA, CONTEXT)).toMatchObject({
      phase: "started",
      countdownMs: 5000,
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
function playing(
  settings: Settings = UNHOSTED,
  roscos?: MatchRoscos,
): MatchState {
  const roles = settings.hosted
    ? { host: CARLOS, player1: ANA, player2: BEA }
    : { player1: ANA, player2: BEA };
  const lobby = withRoles(lobbyOfThree(settings, roscos), roles);
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
function turnBegun(
  settings: Settings = UNHOSTED,
  roscos?: MatchRoscos,
): MatchState {
  const host = settings.hosted ? CARLOS : BEA;
  return accepted(
    playing(settings, roscos),
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
      handoverFrom: "player1",
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
  /**
   * Ana's Clock ran out; Bea's Turn, judged by Ana (by Carlos if Hosted),
   * has just begun.
   */
  const BEA_BEGINS = CLOCK_OUT + 5000;
  function onlyBeaLeft(settings: Settings = UNHOSTED): MatchState {
    const host = settings.hosted ? CARLOS : ANA;
    return accepted(
      turnBegun(settings),
      host,
      { type: "begin-turn" },
      at(BEA_BEGINS),
    );
  }
  /** When Bea's first Fallo is judged, and when the Handover after it ends. */
  const BEA_MISSES = BEA_BEGINS + 1000;
  const BEA_HANDED_OVER = BEA_MISSES + 5000;

  it("stops after a Fallo: the Clock stops, every Device sees the answer, and the Turn stays hers", () => {
    const state = judged(onlyBeaLeft(), ANA, "miss", BEA_MISSES);

    for (const device of [ANA, BEA, CARLOS]) {
      const view = playingView(state, device, BEA_MISSES + 3000);
      expect(view).toMatchObject({
        stage: "handover",
        turn: "player2",
        handoverFrom: "player2",
        handoverMs: 2000,
        revealed: { letter: "A", answer: "Aotrarespuesta" },
      });
      expect(resultsOf(view, "player2")).toBe("m........................");
      expect(view.roscos.player2).toMatchObject({
        current: "B",
        clockMs: 179_000,
        finished: false,
      });
    }
  });

  it("waits after that Handover for Empezar turno from the Player who finished", () => {
    const state = judged(onlyBeaLeft(), ANA, "miss", BEA_MISSES);

    const waiting = playingView(state, BEA, BEA_HANDED_OVER + 10_000);
    expect(waiting).toMatchObject({
      stage: "waiting",
      turn: "player2",
      turnHost: idOf(state, ANA),
      handoverFrom: null,
      handoverMs: null,
      revealed: null,
    });
    expect(waiting.roscos.player2.clockMs).toBe(179_000);
    expect(nextChange(tick(state, BEA_HANDED_OVER))).toBeNull();
    expect(
      rejection(state, BEA, { type: "begin-turn" }, at(BEA_HANDED_OVER)),
    ).toBe("not-host");

    const begun = accepted(
      state,
      ANA,
      { type: "begin-turn" },
      at(BEA_HANDED_OVER + 10_000),
    );
    const running = playingView(begun, BEA, BEA_HANDED_OVER + 12_000);
    expect(running).toMatchObject({ stage: "running", turn: "player2" });
    expect(running.roscos.player2).toMatchObject({
      current: "B",
      clockMs: 177_000,
    });
  });

  it("waits for the dedicated Host's Empezar turno in a Hosted Match", () => {
    const state = judged(onlyBeaLeft(HOSTED), CARLOS, "miss", BEA_MISSES);

    expect(playingView(state, BEA, BEA_HANDED_OVER)).toMatchObject({
      stage: "waiting",
      turn: "player2",
      turnHost: idOf(state, CARLOS),
    });
    expect(
      rejection(state, ANA, { type: "begin-turn" }, at(BEA_HANDED_OVER)),
    ).toBe("not-host");

    const begun = accepted(
      state,
      CARLOS,
      { type: "begin-turn" },
      at(BEA_HANDED_OVER),
    );
    expect(playingView(begun, BEA, BEA_HANDED_OVER).stage).toBe("running");
  });

  it("pauses during that Handover and that waiting Turn as in any other", () => {
    const missed = judged(onlyBeaLeft(), ANA, "miss", BEA_MISSES);

    // Bea drops 1 s into the Handover, and is back 20 s later.
    const paused = away(missed, BEA_MISSES + 1000, BEA);
    expect(playingView(paused, ANA, BEA_MISSES + 21_000)).toMatchObject({
      stage: "handover",
      handoverMs: 4000,
      pause: { missing: [idOf(missed, BEA)] },
    });
    const back = away(paused, BEA_MISSES + 21_000);
    expect(nextChange(back)).toBe(BEA_HANDED_OVER + 20_000);

    // Then Ana, the Host of the waiting Turn, drops.
    const waiting = away(back, BEA_HANDED_OVER + 25_000, ANA);
    expect(playingView(waiting, BEA, BEA_HANDED_OVER + 25_000)).toMatchObject({
      stage: "waiting",
      pause: { missing: [idOf(missed, ANA)] },
    });
    expect(
      rejection(
        waiting,
        ANA,
        { type: "begin-turn" },
        at(BEA_HANDED_OVER + 26_000),
      ),
    ).toBe("match-paused");
  });

  it("plays on after an Acierto, with the Clock running", () => {
    const state = judged(onlyBeaLeft(), ANA, "hit", BEA_BEGINS + 1000);

    const view = playingView(state, BEA, BEA_BEGINS + 3000);
    expect(view).toMatchObject({ stage: "running", turn: "player2" });
    expect(resultsOf(view, "player2")).toBe("h........................");
    expect(view.roscos.player2.clockMs).toBe(177_000);
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
      revealed: { letter: "Z", answer: "Zotrarespuesta" },
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
      otherAnswers: [],
    };

    expect(playingView(playing(), BEA, PLAY_STARTS).clue).toEqual(clueA);
    expect(playingView(turnBegun(), BEA, JUDGED).clue).toEqual(clueA);
  });

  it("lists the other answers the Host can also accept", () => {
    expect(
      playingView(turnBegun(UNHOSTED, WITH_OTHERS), BEA, JUDGED).clue,
    ).toMatchObject({
      answer: "Arespuesta",
      otherAnswers: ["Aalternativa", "Asinónimo"],
    });
    expect(
      playingView(turnBegun(HOSTED, WITH_OTHERS), CARLOS, JUDGED).clue
        ?.otherAnswers,
    ).toEqual(["Aalternativa", "Asinónimo"]);
  });

  it("keeps its other answers out of the revealed answer and the Results", () => {
    const missed = judged(
      turnBegun(UNHOSTED, WITH_OTHERS),
      BEA,
      "miss",
      JUDGED,
    );
    const { state, now } = playedOut(
      [["miss"], ["hit", "miss"], [], []],
      UNHOSTED,
      WITH_OTHERS,
    );

    for (const device of [ANA, BEA, CARLOS]) {
      expect(playingView(missed, device, JUDGED).revealed).toEqual({
        letter: "A",
        answer: "Arespuesta",
      });
      const { results } = playingView(state, device, now);
      expect(results?.clues.player2[1]).toEqual({
        letter: "B",
        contains: false,
        text: "Definición de la B",
        answer: "Botrarespuesta",
        result: "miss",
      });
      expect(JSON.stringify(results)).not.toContain("alternativa");
    }
  });

  it("has no other answers when stored before Clues had them", () => {
    // ROSCO's Clues have no otherAnswers field, as in an older Stock or Match.
    expect(playingView(turnBegun(), BEA, JUDGED).clue?.otherAnswers).toEqual(
      [],
    );
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

  it("also reaches the waiting Player of a Hosted Match, with its answers", () => {
    const clueA = {
      letter: "A",
      contains: false,
      text: "Definición de la A",
      answer: "Arespuesta",
      otherAnswers: ["Aalternativa", "Asinónimo"],
    };

    expect(
      playingView(playing(HOSTED, WITH_OTHERS), BEA, PLAY_STARTS).clue,
    ).toEqual(clueA);
    expect(
      playingView(turnBegun(HOSTED, WITH_OTHERS), BEA, JUDGED).clue,
    ).toEqual(clueA);
  });

  it("follows the Turn to the other waiting Player after a Handover", () => {
    const missed = judged(turnBegun(HOSTED), CARLOS, "miss", JUDGED);

    expect(playingView(missed, ANA, HANDED_OVER).clue).toMatchObject({
      letter: "A",
      answer: "Aotrarespuesta",
    });
    expect(playingView(missed, BEA, HANDED_OVER).clue).toBeNull();
  });

  it("reaches no Member without a role in a Hosted Match", () => {
    const dani = "00000000-0000-4000-8000-00000000000d";
    const lobby = accepted(lobbyOfThree(HOSTED), dani, {
      type: "join",
      name: "Dani",
    });
    const roles = withRoles(lobby, {
      host: CARLOS,
      player1: ANA,
      player2: BEA,
    });
    const started = accepted(roles, ANA, { type: "start" });
    const ready = accepted(accepted(started, ANA, { type: "ready" }), BEA, {
      type: "ready",
    });
    const begun = accepted(
      ready,
      CARLOS,
      { type: "begin-turn" },
      { ...at(PLAY_STARTS), connected: new Set([ANA, BEA, CARLOS, dani]) },
    );

    for (const state of [ready, begun]) {
      const view = viewFor(state, dani, at(JUDGED));
      expect(JSON.stringify(view)).not.toContain("Definición");
      expect(JSON.stringify(view)).not.toContain("respuesta");
    }
  });

  it("never reaches the playing Player or anyone else before it is revealed", () => {
    const hosted = turnBegun(HOSTED);
    const unhosted = turnBegun();
    const sent = [
      viewFor(playing(), ANA, at(PLAY_STARTS)),
      viewFor(unhosted, ANA, at(JUDGED)),
      viewFor(unhosted, CARLOS, at(JUDGED)),
      viewFor(hosted, ANA, at(JUDGED)),
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
  roscos?: MatchRoscos,
): { state: MatchState; now: number } {
  let state = tick(playing(settings, roscos), PLAY_STARTS);
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

/** The Roscos `rematched()` gives the Rematch: the Match's, swapped. */
const REMATCH_ROSCOS: MatchRoscos = [OTHER_ROSCO, ROSCO];

/** Has the Creator press Revancha once `over()` has ended; must be accepted. */
function rematched(settings: Settings = UNHOSTED): {
  before: MatchState;
  state: MatchState;
  rematchState: MatchState;
} {
  const { state: before, now } = over(settings);
  const result = rematch(before, ANA, "next", REMATCH_ROSCOS, now);
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
      countdownMs: null,
    });
  });

  it("gives the new Match the Roscos it is given, and nothing of the old one's play", () => {
    const { rematchState: next } = rematched();

    const ready = accepted(accepted(next, ANA, { type: "ready" }), BEA, {
      type: "ready",
    });
    const view = playingView(ready, ANA, PLAY_STARTS);
    expect(view).toMatchObject({
      turn: "player2",
      stage: "waiting",
      clue: { letter: "A", answer: REMATCH_ROSCOS[1][0]?.answer },
    });
    expect(resultsOf(view, "player1")).toBe(".........................");
    expect(view.roscos.player2.clockMs).toBe(180_000);
  });

  it("is only for the Creator", () => {
    const { state, now } = over();
    expect(rematch(state, BEA, "next", REMATCH_ROSCOS, now)).toEqual({
      ok: false,
      reason: "not-creator",
    });
    expect(rematchRefusal(state, BEA, now)).toBe("not-creator");
  });

  it("waits for the Match to be over", () => {
    const { state, now } = playedOut([["hit", "miss"]]);
    expect(rematch(state, ANA, "next", REMATCH_ROSCOS, now)).toEqual({
      ok: false,
      reason: "match-not-over",
    });
    expect(rematchRefusal(state, ANA, now)).toBe("match-not-over");
  });

  it("happens once", () => {
    const { state } = rematched();
    expect(rematch(state, ANA, "another", REMATCH_ROSCOS, NOW)).toEqual({
      ok: false,
      reason: "already-rematched",
    });
    expect(rematchRefusal(state, ANA, NOW)).toBe("already-rematched");
  });

  it("can be refused or not before its Roscos are drawn", () => {
    const { state, now } = over();
    expect(rematchRefusal(state, ANA, now)).toBeNull();
  });
});

/** Tells the Match which Devices have it open at `now`: everyone but `gone`. */
function away(
  state: MatchState,
  now: number,
  ...gone: DeviceKey[]
): MatchState {
  return devicesChanged(state, connectedBut(gone), now);
}

function connectedBut(gone: DeviceKey[]): Set<DeviceKey> {
  return new Set([ANA, BEA, CARLOS].filter((each) => !gone.includes(each)));
}

/** When a Device drops during `turnBegun()`'s Turn, Ana's. */
const DROPPED = PLAY_STARTS + 10_000;

describe("a Pause", () => {
  it("stops the running Clock when the playing Player's Device drops", () => {
    const state = away(turnBegun(), DROPPED, ANA);

    const view = playingView(state, BEA, DROPPED + 20_000);
    expect(view.stage).toBe("running");
    expect(view.roscos.player1.clockMs).toBe(170_000);
    expect(view.pause).toEqual({
      missing: [idOf(state, ANA)],
      abandonMs: 40_000,
    });
  });

  it("starts when the Host's Device drops", () => {
    const state = away(turnBegun(), DROPPED, BEA);

    expect(playingView(state, ANA, DROPPED).pause).toEqual({
      missing: [idOf(state, BEA)],
      abandonMs: 60_000,
    });
  });

  it("doesn't start when a Device the Turn doesn't need drops", () => {
    // Carlos has no role; in a Hosted Match, Bea waits for her Turn.
    const unhosted = away(turnBegun(), DROPPED, CARLOS);
    const hosted = away(turnBegun(HOSTED), DROPPED, BEA);

    for (const state of [unhosted, hosted]) {
      const view = playingView(state, ANA, DROPPED + 20_000);
      expect(view.pause).toBeNull();
      expect(view.roscos.player1.clockMs).toBe(150_000);
      expect(nextChange(state)).toBe(CLOCK_OUT);
    }
  });

  it("ends once every Device the Turn needs is back, the Clock going on from where it stopped", () => {
    const paused = away(turnBegun(), DROPPED, ANA, BEA);
    const anaBack = away(paused, DROPPED + 10_000, BEA);
    expect(playingView(anaBack, ANA, DROPPED + 10_000).pause).toEqual({
      missing: [idOf(paused, BEA)],
      abandonMs: 50_000,
    });

    const back = away(anaBack, DROPPED + 30_000);

    const view = playingView(back, BEA, DROPPED + 40_000);
    expect(view).toMatchObject({ stage: "running", pause: null });
    expect(view.roscos.player1.clockMs).toBe(160_000);
    expect(nextChange(back)).toBe(CLOCK_OUT + 30_000);
  });

  it("stops the Handover too", () => {
    // After Ana's Fallo, Bea plays next and Ana is her Host.
    const missed = judged(turnBegun(), BEA, "miss", JUDGED);
    const paused = away(missed, JUDGED + 1000, BEA);

    const waited = tick(paused, JUDGED + 30_000);
    expect(playingView(waited, ANA, JUDGED + 30_000)).toMatchObject({
      stage: "handover",
      handoverMs: 4000,
    });

    const back = away(waited, JUDGED + 31_000);
    expect(nextChange(back)).toBe(HANDED_OVER + 30_000);
  });

  it("starts when the Turn passes to a Player whose Device has dropped", () => {
    const beaGone = away(turnBegun(HOSTED), PLAY_STARTS + 1000, BEA);

    const missed = judged(beaGone, CARLOS, "miss", JUDGED);

    expect(playingView(missed, CARLOS, JUDGED).pause).toEqual({
      missing: [idOf(missed, BEA)],
      abandonMs: 60_000,
    });
  });

  it("starts with the first Turn if a Device it needs dropped during the countdown", () => {
    const state = away(playing(), NOW + 1000, ANA);

    expect(playingView(state, BEA, PLAY_STARTS + 10_000).pause).toEqual({
      missing: [idOf(state, ANA)],
      abandonMs: 50_000,
    });
  });

  it("doesn't start once the Match is over", () => {
    const { state, now } = over();

    const view = playingView(away(state, now, ANA), BEA, now);
    expect(view).toMatchObject({ stage: "over", pause: null });
  });

  it("holds back Empezar turno and the verdicts", () => {
    const waiting = away(tick(playing(), PLAY_STARTS), PLAY_STARTS, ANA);
    expect(
      rejection(waiting, BEA, { type: "begin-turn" }, at(PLAY_STARTS + 1000)),
    ).toBe("match-paused");

    const running = away(turnBegun(), DROPPED, ANA);
    expect(
      rejection(
        running,
        BEA,
        { type: "judge", verdict: "hit" },
        at(DROPPED + 1000),
      ),
    ).toBe("match-paused");
  });

  it("makes its 60 s end the next change time alone makes", () => {
    expect(nextChange(away(turnBegun(), DROPPED, ANA))).toBe(DROPPED + 60_000);
  });
});

/** When the Pause that began at DROPPED reaches 60 s. */
const ABANDONED = DROPPED + 60_000;

describe("an Abandoned Match", () => {
  it("is one whose Pause lasted 60 s, on every Device", () => {
    const state = tick(away(turnBegun(), DROPPED, ANA), ABANDONED);

    for (const device of [ANA, BEA, CARLOS]) {
      expect(playingView(state, device, ABANDONED)).toMatchObject({
        stage: "abandoned",
        pause: null,
        results: null,
        clue: null,
      });
    }
  });

  it("isn't one a moment before", () => {
    const state = away(turnBegun(), DROPPED, ANA);

    expect(playingView(state, BEA, ABANDONED - 1).stage).toBe("running");
  });

  it("stays abandoned when the Device comes back", () => {
    const back = away(away(turnBegun(), DROPPED, ANA), ABANDONED + 1000);

    expect(playingView(back, ANA, ABANDONED + 2000).stage).toBe("abandoned");
    expect(nextChange(back)).toBeNull();
  });

  it("takes no more verdicts, and can't be rematched", () => {
    const state = tick(away(turnBegun(), DROPPED, ANA), ABANDONED);

    expect(
      rejection(state, BEA, { type: "judge", verdict: "hit" }, at(ABANDONED)),
    ).toBe("match-abandoned");
    expect(rematch(state, ANA, "next", REMATCH_ROSCOS, ABANDONED)).toEqual({
      ok: false,
      reason: "match-not-over",
    });
  });
});

describe("a Device going silent", () => {
  /** When each Device was last heard from: all at `now`, but Ana at `ana`. */
  function heard(now: number, ana: number): Map<DeviceKey, number> {
    return new Map([
      [ANA, ana],
      [BEA, now],
      [CARLOS, now],
    ]);
  }

  it("counts as gone once unheard for 10 s while a Turn is being played", () => {
    const now = DROPPED + 10_000;

    expect(silent(turnBegun(), heard(now, DROPPED), now)).toEqual([ANA]);
    expect(silent(turnBegun(), heard(now, DROPPED + 1), now)).toEqual([]);
  });

  it("counts during a Pause, and once the countdown is over", () => {
    const paused = away(turnBegun(), DROPPED, BEA);
    const now = DROPPED + 20_000;

    expect(silent(paused, heard(now, DROPPED), now)).toEqual([ANA]);
    expect(silent(playing(), heard(now, NOW), now)).toEqual([ANA]);
  });

  it("doesn't count before the first Turn or once the Match has ended", () => {
    const now = NOW + 60_000;
    const lobby = lobbyOfThree();
    const countdown = playing();
    const { state: ended, now: overAt } = over();
    const abandoned = tick(away(turnBegun(), DROPPED, BEA), ABANDONED);

    expect(silent(lobby, heard(now, NOW), now)).toEqual([]);
    expect(
      silent(countdown, heard(PLAY_STARTS - 1, NOW - 20_000), PLAY_STARTS - 1),
    ).toEqual([]);
    expect(silent(ended, heard(overAt, NOW), overAt)).toEqual([]);
    expect(silent(abandoned, heard(ABANDONED, NOW), ABANDONED)).toEqual([]);
  });

  it("pauses the Match from when it was last heard from", () => {
    const noticed = DROPPED + 12_000;

    const state = devicesChanged(
      turnBegun(),
      connectedBut([ANA]),
      noticed,
      new Map([[ANA, DROPPED]]),
    );

    const view = playingView(state, BEA, noticed);
    expect(view.roscos.player1.clockMs).toBe(170_000);
    expect(view.pause).toEqual({
      missing: [idOf(state, ANA)],
      abandonMs: 48_000,
    });
  });

  it("pauses no earlier than the Clock last started", () => {
    const state = devicesChanged(
      turnBegun(),
      connectedBut([ANA]),
      PLAY_STARTS + 5000,
      new Map([[ANA, NOW]]),
    );

    const view = playingView(state, BEA, PLAY_STARTS + 5000);
    expect(view.roscos.player1.clockMs).toBe(180_000);
    expect(view.pause?.abandonMs).toBe(55_000);
  });

  it("pauses no earlier than the Handover began", () => {
    // After Ana's Fallo, Bea plays next and Ana is her Host.
    const missed = judged(turnBegun(), BEA, "miss", JUDGED);

    const state = devicesChanged(
      missed,
      connectedBut([BEA]),
      JUDGED + 3000,
      new Map([[BEA, PLAY_STARTS]]),
    );

    expect(playingView(state, ANA, JUDGED + 3000)).toMatchObject({
      stage: "handover",
      handoverMs: 5000,
    });
  });

  it("pauses from when the first Device the Turn needs was last heard from", () => {
    // In a Hosted Match, Bea waits for her Turn: her silence pauses nothing.
    const noticed = DROPPED + 12_000;
    const state = devicesChanged(
      turnBegun(HOSTED),
      connectedBut([ANA, BEA]),
      noticed,
      new Map([
        [BEA, PLAY_STARTS + 2000],
        [ANA, DROPPED],
      ]),
    );

    const view = playingView(state, CARLOS, noticed);
    expect(view.roscos.player1.clockMs).toBe(170_000);
    expect(view.pause?.abandonMs).toBe(48_000);
  });

  it("pauses from when the Turn passed to a Player last heard from before", () => {
    // Bea goes silent during Ana's Turn, which runs out while unnoticed.
    const state = devicesChanged(
      turnBegun(HOSTED),
      connectedBut([BEA]),
      CLOCK_OUT + 3000,
      new Map([[BEA, DROPPED]]),
    );

    expect(playingView(state, CARLOS, CLOCK_OUT + 3000)).toMatchObject({
      turn: "player2",
      stage: "handover",
      handoverMs: 5000,
      pause: { missing: [idOf(state, BEA)], abandonMs: 57_000 },
    });
  });
});

/** When Carlos, Host of `playing(HOSTED)`, shows the Tally in these tests. */
const SHOWN = PLAY_STARTS + 1000;

/** `playing(HOSTED)` with the Tally shown by its Host at SHOWN. */
function tallyShown(): MatchState {
  return accepted(playing(HOSTED), CARLOS, { type: "show-tally" }, at(SHOWN));
}

describe("the Tally", () => {
  const hide = { type: "hide-tally" } as const;

  it("shows on every Device until the Host closes it", () => {
    const state = tallyShown();

    for (const device of [ANA, BEA, CARLOS]) {
      expect(playingView(state, device, SHOWN + 60_000).tallyShown).toBe(true);
    }
    expect(playingView(state, ANA, SHOWN).stage).toBe("waiting");
    expect(nextChange(state)).toBeNull();
  });

  it("isn't shown until the Host shows it", () => {
    expect(playingView(playing(HOSTED), ANA, SHOWN).tallyShown).toBe(false);
    expect(playingView(playing(), ANA, SHOWN).tallyShown).toBe(false);
  });

  it("closes on every Device when the Host closes it", () => {
    const closed = accepted(tallyShown(), CARLOS, hide, at(SHOWN + 3000));

    for (const device of [ANA, BEA, CARLOS]) {
      expect(playingView(closed, device, SHOWN + 3000).tallyShown).toBe(false);
    }
  });

  it("stays shown when shown again", () => {
    const again = accepted(
      tallyShown(),
      CARLOS,
      { type: "show-tally" },
      at(SHOWN + 3000),
    );

    expect(playingView(again, ANA, SHOWN + 3000).tallyShown).toBe(true);
  });

  it("is only for a Hosted Match", () => {
    for (const action of [{ type: "show-tally" } as const, hide]) {
      expect(rejection(playing(), BEA, action, at(PLAY_STARTS))).toBe(
        "not-hosted",
      );
    }
  });

  it("is shown and closed only by the Host", () => {
    for (const device of [ANA, BEA]) {
      expect(
        rejection(
          playing(HOSTED),
          device,
          { type: "show-tally" },
          at(PLAY_STARTS),
        ),
      ).toBe("not-host");
      expect(rejection(tallyShown(), device, hide, at(SHOWN))).toBe("not-host");
    }
  });

  it("is only while a Turn waits for Empezar turno", () => {
    const show = { type: "show-tally" } as const;
    const lobby = withRoles(lobbyOfThree(HOSTED), {
      host: CARLOS,
      player1: ANA,
      player2: BEA,
    });
    expect(rejection(lobby, CARLOS, show)).toBe("not-started");
    expect(rejection(playing(HOSTED), CARLOS, show, at(PLAY_STARTS - 1))).toBe(
      "turn-not-waiting",
    );
    expect(rejection(turnBegun(HOSTED), CARLOS, show, at(JUDGED))).toBe(
      "turn-not-waiting",
    );
    const missed = judged(turnBegun(HOSTED), CARLOS, "miss", JUDGED);
    expect(rejection(missed, CARLOS, show, at(JUDGED + 1000))).toBe(
      "turn-not-waiting",
    );
    const { state, now } = over(HOSTED);
    expect(rejection(state, CARLOS, show, at(now))).toBe("turn-not-waiting");
  });

  it("isn't shown or closed while the Match is paused or abandoned", () => {
    const show = { type: "show-tally" } as const;
    const paused = away(playing(HOSTED), PLAY_STARTS, ANA);
    expect(rejection(paused, CARLOS, show, at(SHOWN))).toBe("match-paused");
    const pausedShowing = away(tallyShown(), SHOWN + 1000, ANA);
    expect(rejection(pausedShowing, CARLOS, hide, at(SHOWN + 2000))).toBe(
      "match-paused",
    );

    const abandoned = tick(paused, PLAY_STARTS + 60_000);
    expect(rejection(abandoned, CARLOS, show, at(PLAY_STARTS + 60_000))).toBe(
      "match-abandoned",
    );
  });

  it("holds back Empezar turno until the Host closes it", () => {
    expect(
      rejection(
        tallyShown(),
        CARLOS,
        { type: "begin-turn" },
        at(SHOWN + 60_000),
      ),
    ).toBe("tally-showing");

    const closed = accepted(tallyShown(), CARLOS, hide, at(SHOWN + 3000));
    const begun = accepted(
      closed,
      CARLOS,
      { type: "begin-turn" },
      at(SHOWN + 4000),
    );
    expect(playingView(begun, ANA, SHOWN + 4000).stage).toBe("running");
  });

  it("is still shown after a Pause", () => {
    const paused = away(tallyShown(), SHOWN + 2000, ANA);
    const back = away(paused, SHOWN + 30_000);

    expect(playingView(back, CARLOS, SHOWN + 31_000).tallyShown).toBe(true);
  });

  it("isn't shown once the Match is abandoned", () => {
    const paused = away(tallyShown(), SHOWN + 2000, ANA);

    const abandoned = tick(paused, SHOWN + 62_000);
    expect(playingView(abandoned, CARLOS, SHOWN + 62_000).tallyShown).toBe(
      false,
    );
  });
});
