# Pasapalabra

An online, Spanish-language El Rosco for two Players and a Host in one room. See [`GLOSSARY.md`](GLOSSARY.md) for the terms, [`docs/adr/`](docs/adr/) for the decisions and [`CODING_STANDARDS.md`](CODING_STANDARDS.md) for how code is written.

It runs on Cloudflare Workers: one Durable Object per Match owns its state and the WebSockets of every device following it (ADR 0002). Devices render the full state the Match broadcasts on every change. So far the only state is how many Devices are connected; Devices sending actions (joining, roles, the Turn) arrives with the lobby ticket (#3), and reconnecting after a drop with #8.

## Layout

| Path          | What                                                                          |
| ------------- | ----------------------------------------------------------------------------- |
| `src/worker/` | The Worker (HTTP routes) and the `Match` Durable Object                       |
| `src/client/` | The browser code, bundled by esbuild into `public/app.js`                     |
| `src/shared/` | The protocol between the two: message types and their validation              |
| `public/`     | Static pages and styles, served by Workers assets                             |
| `test/`       | Tests that run inside the Workers runtime (`@cloudflare/vitest-pool-workers`) |

Routes: `POST /api/matches` creates a Match and returns `{ "id": "…" }`; `/m/<id>` opens it; `/api/matches/<id>/ws` is its WebSocket.

## Run

Requires Node 24.

```sh
npm install
npm run dev
```

Opens on <http://localhost:8787>. Wrangler bundles the client before starting and again whenever `src/client/` or `src/shared/` changes.

## Test and check

```sh
npm test            # all tests, inside the Workers runtime
npm run typecheck   # worker, client, shared code and tests
npm run lint        # ESLint, type-aware
npm run format      # Prettier
```

All four must pass before every commit. After changing `wrangler.jsonc`, run `npx wrangler types` to regenerate `worker-configuration.d.ts`, which types the bindings.

## Deploy

```sh
npx wrangler login   # once
npm run deploy
```

Deploys to your Cloudflare account's `workers.dev` subdomain. Durable Objects with SQLite storage are on the Workers free plan.
