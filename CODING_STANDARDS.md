# Coding standards

Rules for all code in this repo. Each rule says why, so edge cases can be judged by its intent. Formatting and anything else Prettier or ESLint enforce is not repeated here.

## Architecture: pure core, thin Durable Object

- **Game rules are pure functions.** They take the current state and an action and return the new state. They do no I/O and import nothing from Cloudflare. Time and randomness are arguments: no `Date.now()` or `Math.random()` inside the rules.
  _Why_: rules can be tested in plain Vitest, deterministically, without the Workers runtime.
- **The Durable Object is the shell.** It loads and stores state, accepts WebSockets, validates incoming messages, calls the rules, broadcasts the new state and sets alarms for clocks. It holds no game rules itself.
  _Why_: one place for side effects, one place for logic.
- **The client holds no game rules** (ADR 0002). It sends actions and renders the state it receives.

## TypeScript

- `strict` and `noUncheckedIndexedAccess` are on.
- No `any`: use `unknown` and narrow it.
- No `as` type assertions and no non-null assertions (`!`) outside tests. `as const` is fine.
  _Why_: each one is a place where the compiler stops checking.
- Everything arriving over a WebSocket or HTTP is `unknown` until validated at the boundary, with a schema or a type guard. The rules never see unvalidated data.
  _Why_: any client can send anything; the Durable Object is the only authority (ADR 0002).

## Names and language

- Domain concepts use the terms in `GLOSSARY.md`: `Match`, `Rosco`, `Clue`, `Turn`, `Hit`, `Miss`, `Pasapalabra`, `Host`, `Player`, `Creator`… Never their _Avoid_ synonyms (`game`, `room`, `wheel`, `question`, `skip`, `correct`…).
- A concept missing from the glossary is added to it first (with `/domain-modeling`), not named ad hoc in code.
- Identifiers, comments and commit messages are in English. Every string the user sees is in Spanish, using the glossary's _UI_ labels (Partida, Acierto, Fallo…).

## Tests

- Game rules are written test-first: a failing test, the code that passes it, then refactor.
- Tests go through public interfaces: send actions, assert on the resulting state or on what clients receive. They don't reach into private helpers or internal fields.
  _Why_: tests that check behaviour survive refactors; tests that check internals break on them.
- Rules are tested in plain Vitest. Durable Object tests (`@cloudflare/vitest-pool-workers`) cover only the shell: WebSockets, broadcasting, storage, alarms.
- Tests don't wait on real time. Pass in the time, or use alarms the test triggers.

## Tooling

- Prettier formats; ESLint with type-aware `typescript-eslint` lints. Where a rule above can be a lint rule (`no-explicit-any`, `consistent-type-assertions`, `no-non-null-assertion`), ESLint enforces it, relaxed for test files only.
- `npm run typecheck`, `npm run lint` and `npm test` pass before every commit.
