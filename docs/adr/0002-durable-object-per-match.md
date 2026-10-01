# One Durable Object per Match holds the authoritative game state

Turns, clocks and Hits must have a single source of truth that both Players' devices follow, and the LLM key must stay server-side, all on a free budget. We run on Cloudflare Workers with one Durable Object per Match, which owns that Match's state, WebSockets and timers. We rejected a Node + WebSockets server (needs always-on hosting, not free) and Firebase/Supabase realtime (game rules would be split between clients and database rules). This ties the backend to Cloudflare.
