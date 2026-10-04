# Pasapalabra

An online, Spanish-language El Rosco for two Players and a Host in one room. See [`GLOSSARY.md`](GLOSSARY.md) for the terms, [`docs/adr/`](docs/adr/) for the decisions and [`CODING_STANDARDS.md`](CODING_STANDARDS.md) for how code is written.

It runs on Cloudflare Workers: one Durable Object per Match owns its state and the WebSockets of every Device following it (ADR 0002). Devices send actions (join, assign a role, Empezar) and render the full view the Match sends each of them on every change. Reconnecting after a drop arrives with #8.

A Match draws both its Roscos from the Word List when it is created (ADR 0005), the second avoiding the first one's answers, so there is nothing to wait for after Empezar: the 5 s countdown to the first Turn starts once both Players have pressed ¡Listo!. The Word List, `data/word-list.json`, is built by `npm run build:word-list` from open data and bundled with the Worker; each Clue is a Word's Wikcionario definition. Both Roscos also avoid the Recent Answers: the `RecentAnswers` Durable Object (formerly the `Stock`) remembers, per Difficulty, the answers of the last `RECENT_ROSCOS` Roscos drawn (`src/shared/word-list.ts`), so they don't come back in the next Matches.

## Layout

| Path            | What                                                                               |
| --------------- | ---------------------------------------------------------------------------------- |
| `src/rules/`    | The game rules: pure functions from state and action to new state, no Cloudflare   |
| `src/clues/`    | Drawing a Rosco from the Word List, and the checks every Clue must pass            |
| `src/worker/`   | The Worker (HTTP routes), the `Match` and `RecentAnswers` Durable Objects          |
| `src/client/`   | The browser code, bundled by esbuild into `public/app.js`                          |
| `src/shared/`   | The protocol between the two: message schemas (zod) and their types                |
| `public/`       | Static pages and styles, served by Workers assets                                  |
| `test/rules/`   | Tests of the rules, in plain Node                                                  |
| `test/clues/`   | Tests of the draw, with a tiny Word List, and of the Clue checks, in plain Node    |
| `test/workers/` | Tests of the shell, inside the Workers runtime (`@cloudflare/vitest-pool-workers`) |

Routes:

- `POST /api/matches` with `{ "settings": {…}, "creator": { "name": "…", "device": "<uuid>" } }` creates a Match and returns `{ "id": "…" }`.
- `/m/<id>` opens it.
- `/api/matches/<id>/ws?device=<uuid>` is its WebSocket. The `device` key is a secret each browser generates once per Match and keeps in `localStorage`, so a reload keeps its identity.

## Run

Requires Node 24.

```sh
npm install
npm run dev
```

Opens on <http://localhost:8787>. To join from phones on the same Wi-Fi, run `npm run dev -- --ip 0.0.0.0` and create the Match from `http://<your-computer's-LAN-IP>:8787`: the Lobby's link and QR code point at whatever address the Creator used. Wrangler bundles the client before starting and again whenever `src/client/` or `src/shared/` changes.

## Test and check

```sh
npm test            # rules in Node, shell inside the Workers runtime
npm run typecheck   # worker, client, shared code and tests
npm run lint        # ESLint, type-aware
npm run format      # Prettier
```

All four must pass before every commit. After changing `wrangler.jsonc`, run `npx wrangler types` to regenerate `worker-configuration.d.ts`, which types the bindings.

## Deploy

```sh
npx wrangler login  # once
npm run deploy
```

Deploys to your Cloudflare account's `workers.dev` subdomain. Durable Objects with SQLite storage are on the Workers free plan.
