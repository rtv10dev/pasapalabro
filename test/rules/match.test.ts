import { describe, expect, it } from "vitest";
import {
  act,
  newMatch,
  viewFor,
  type Context,
  type MatchState,
} from "../../src/rules/match";
import {
  ROLES,
  type Action,
  type DeviceKey,
  type Role,
  type Settings,
} from "../../src/shared/protocol";

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

function created(settings: Settings = UNHOSTED): MatchState {
  const result = newMatch(settings, { name: "Ana", device: ANA });
  if (!result.ok) throw new Error(`Rejected: ${result.reason}`);
  return result.state;
}

/** Applies an Action that must be accepted. */
function accepted(
  state: MatchState,
  device: DeviceKey,
  action: Action,
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
  action: Action,
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
function ready(): MatchState {
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
    expect(canStart(ready(), WITHOUT_BEA)).toBe(false);
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

describe("starting the Match", () => {
  it("shows every Device the roles and who plays first", () => {
    const lobby = ready();

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
      ready(),
      ANA,
      { type: "start" },
      { ...CONTEXT, random: 0.99 },
    );

    expect(viewFor(state, ANA, CONTEXT)).toMatchObject({
      firstPlayer: "player2",
    });
  });

  it("counts down 5 seconds before the first Turn", () => {
    const state = accepted(ready(), ANA, { type: "start" });

    expect(viewFor(state, ANA, CONTEXT)).toMatchObject({ countdownMs: 5000 });
    expect(viewFor(state, ANA, { ...CONTEXT, now: NOW + 2000 })).toMatchObject({
      countdownMs: 3000,
    });
    expect(viewFor(state, ANA, { ...CONTEXT, now: NOW + 9000 })).toMatchObject({
      countdownMs: 0,
    });
  });

  it("is only for the Creator", () => {
    expect(rejection(ready(), BEA, { type: "start" })).toBe("not-creator");
  });

  it("needs every role assigned", () => {
    const state = withRoles(lobbyOfThree(HOSTED), {
      player1: ANA,
      player2: BEA,
    });

    expect(rejection(state, ANA, { type: "start" })).toBe("roles-missing");
  });

  it("needs everyone with a role connected", () => {
    expect(rejection(ready(), ANA, { type: "start" }, WITHOUT_BEA)).toBe(
      "member-disconnected",
    );
  });

  it("closes the Lobby", () => {
    const state = accepted(ready(), ANA, { type: "start" });
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

describe("removing a Member", () => {
  it("takes a disconnected Member out of the Match and their role", () => {
    const lobby = ready();

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
    const lobby = ready();
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
    const lobby = ready();

    expect(
      rejection(lobby, ANA, { type: "remove", member: idOf(lobby, BEA) }),
    ).toBe("member-connected");
  });

  it("is only for the Creator", () => {
    const lobby = ready();

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
    expect(rejection(ready(), ANA, { type: "remove", member: 999 })).toBe(
      "unknown-member",
    );
  });
});
