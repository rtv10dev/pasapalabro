# Official Clues from the TV show: research notes

Question: can a Difficulty option use the **official Clues** from Antena 3's Pasapalabra, taken from the show's playable Rosco on its website? Also: can we reuse the show's El Rosco sound effects?

All sources were accessed on **2026-10-03** unless a date says otherwise. "Wayback" means an Internet Archive capture of the first-party URL, not a third-party copy. Paths are given in full so each claim can be checked again.

## Short answer

**Not feasible as a live source, and legally risky in any form.**

- The official playable Rosco ("Rosco virtual") existed, but it was a **weekly** Rosco, not a daily one. It ran from May 2020 to **8 June 2026**, and **it has been taken down.** Its page now redirects (301) to the show's homepage, the game's iframe returns 404, and its data endpoint answers "Lo sentimos, este contenido ya no está disponible".
- The takedown lines up with the show dropping El Rosco altogether. Its last Rosco aired on 18 June 2026 and the new final round, **AlaZ**, started on 19 June 2026. Press reports put this down to a Supreme Court ruling that the Rosco format belongs to MC&F, not to ITV/Antena 3. *I verified the takedown against first-party sites. I did not verify the ruling against a primary source.*
- While it was live, the endpoint was trivial to use: one unauthenticated GET per Rosco returned a JSON array of 25 `{pregunta, respuesta}` items. **The answers were included** and checked in the browser. `Access-Control-Allow-Origin: *` was set. The archive still holds some of these responses.
- Atresmedia's legal notice forbids reproducing site content without prior written permission. It also makes an **express reservation against text-and-data mining**, which is the opt-out under EU DSM Directive art. 4. Copying the Clues into our Stock would be reproduction plus public communication, with nothing that would make it fair use.
- `www.antena3.com` sits behind a Fastly bot challenge (a JavaScript "Client Challenge"). A Worker would be blocked for any page that isn't already in the CDN cache.

**Main risks:** (1) intellectual property in both the Clues (Atresmedia) and the Rosco format itself (MC&F, per the reported ruling); (2) the source is gone, so only archive captures remain; (3) bot protection on antena3.com. The sound effects carry the same copyright problem, and none of them is a 5-second tick (see §6).

---

## 1. Does an official playable or daily Rosco exist?

**It existed. It no longer does.**

| What | URL | Status on 2026-10-03 | Evidence |
|---|---|---|---|
| "Rosco virtual" page (title "El rosco virtual de Pasapalabra") | `https://www.antena3.com/programas/pasapalabra/rosco-virtual/` | **301 → `/programas/pasapalabra/`** | curl from here; Wayback capture `20260513063532` still shows the page, with an iframe `id="pasapajuego"` pointing at the game |
| The game itself (iframe) | `https://atreslab.com/modulosblancos/rosco-pasapalabra/?2` (and `?rosco=<ID>`) | **404**; the body is a JS redirect to `https://www.atresmedia.com` | curl from here; last good Wayback capture `20260616101627` |
| "Juega a Pasapalabra desde tu casa" landing page (official app + Alexa skill) | `https://www.antena3.com/programas/pasapalabra/juego/` | Behind the bot challenge, so I couldn't see it live | Wayback `20260518123400` |
| El Rosco news section | `https://www.antena3.com/programas/pasapalabra/rosco/` | **301 → `/programas/pasapalabra/`** (Wayback first records the 301 on `20260619063147`) | curl + Wayback CDX |

Further evidence:

- The live show homepage `https://www.antena3.com/programas/pasapalabra/` contains no instance of "rosco" (case-insensitive). Its sections are now `alaz/`, `extra/`, `noticias/`, `mejores-momentos/` and so on. The AlaZ page's title is "AlaZ: la nueva prueba final de Pasapalabra" (`https://www.antena3.com/programas/pasapalabra/alaz/`).
- The section sitemap `https://www.antena3.com/sitemaps/section_sitemap_index.xml` lists no game or Rosco section for Pasapalabra.
- In the archived `/juego/` page, the text is: "¿Quieres jugar al rosco de Pasapalabra desde casa? … Recuerda que también puedes enfrentarte a los roscos del programa a través de nuestro Rosco Virtual". About the Alexa skill it says: "Con nuevos roscos cada semana … Puedes retarte en solitario con los roscos que aparecen en el programa".
- The archived game page from 16 June 2026 says "Vas a jugar al Rosco 08/06/2026". Its carousel holds 51 earlier Roscos, each labelled with a date (08/06, 01/06, 25/05, …), all one week apart.

**So it was weekly, not daily.** The index file (§2) lists 324 Roscos. 279 of them are dated on a Monday, and the dates run from May 2020 to 8 June 2026. A few entries have obviously mistyped dates: ID 13960 is "1/6/2025" while its neighbours are 2026, and one entry is dated 2010.

## 2. How the page got its Clues

These details come from the archived game HTML (`20260616101627`, `20240517182202`) and the archived `scripts.js?2` (`https://atreslab.com/modulosblancos/static/roscos-pasapalabra/scripts.js?2`, Wayback `20250707135911`; it returns 404 live).

**How the page selects a Rosco.** The game reads `rosco` from the query string (`getQueryVariable("rosco")`). With no ID, the server-rendered page redirects to the newest Rosco: `window.location.href = "https://atreslab.com/modulosblancos/rosco-pasapalabra/?rosco=14008"`. The carousel holds older IDs, so past weeks could be reached by ID. **There was no date parameter. Each Rosco is addressed by a WordPress post ID.**

**Data request.** From `scripts.js`:

```js
jsonACargar = 'https://atreslab.com/modulosblancos/' + rosco + '/';
$.get(jsonACargar, function (data) {jsonActual = JSON.parse(data);});
```

- A plain `GET https://atreslab.com/modulosblancos/<ID>/`, with no auth, no cookies and no custom headers.
- It's a WordPress install. The archived response headers include `link: <https://atreslab.com/modulosblancos/wp-json/wp/v2/posts/10184>`, `access-control-allow-origin: *`, `x-robots-tag: noindex, nofollow`, `server: cloudflare` and `cache-control: public, s-maxage=604800` (Wayback `20240215001958`, `x-archive-orig-*` headers).
- The body is sent as `text/html` but is a JSON array of 25 items, one per letter in the order A B C D E F G H I J L M N Ñ O P Q R S T U V X Y Z (K and W are absent: the `letras` array in `scripts.js`).

**Response sample.** Trimmed from the Wayback capture of `https://atreslab.com/modulosblancos/10184/` (captured 2024-02-15; the Rosco is dated 5/2/2024):

```json
[
  {"pregunta": "Ruido producido por gente que grita, se ríe o habla estridentemente", "respuesta": "Alboroto,Algarabía"},
  {"pregunta": "Rizo de pelo de forma de hélice", "respuesta": "Bucle"},
  {"pregunta": "Banda o sujeción pendiente del cuello o del hombro para inmovilizar un brazo lesionado", "respuesta": "Cabestrillo,Charpa"},
  "… 21 more …",
  {"pregunta": "Hueso del pie que forma el talón", "respuesta": "Zancajo"}
]
```

Notes on the format:
- `respuesta` can hold several accepted answers separated by commas.
- **There is no "empieza por / contiene" field.** The client works it out with `respuesta.startsWith(letra) ? "Empieza por" : "Contiene la"`. For example, Ñ → "Albañilería".
- **The answers are included in the response and checked in the browser.** The code strips accents and spaces, uppercases the input, then compares it to each comma-separated answer. There is no server-side check.

**Index of Roscos (still live).** `https://alexa-pasapalabra.antena3.com/cache-roscos/cache-roscos.json` returns 200 `application/json`. It is 27,578 bytes, served from S3 behind CloudFront, with `last-modified: Tue, 09 Jun 2026 00:00:51 GMT`. It is an array of 324 entries like `{"ID": 14008, "DATE": "8/6/2026", "tournamentId": "8441e60f-…"}`. The game page used it for a ranking widget, together with `https://api-pasapalabra.antena3.com/ranking?tournamentId=…`, which now returns 503/404. **It holds IDs and dates only, no Clues.**

**What happens live now.** `GET https://atreslab.com/modulosblancos/14008/` and `/10603/` both return 200 with the body "Lo sentimos, este contenido ya no está disponible". The Clues have been withdrawn.

**Past days.** While the service was live, past Roscos could be fetched by ID. Today only Roscos the Internet Archive happened to capture survive. A few numeric captures exist (for example 10184), but most IDs in the index have no capture: a CDX check of the newest 60 IDs found exactly one.

## 3. Could a Cloudflare Worker fetch it server-side?

I tried with curl from this machine (no browser):

- **antena3.com:** the first requests for pages already in the CDN cache returned 200 with full HTML (`x-cache: HIT`, Fastly/Varnish). A request for any page not in the cache, including made-up paths and later even `/sitemaps/content_sitemap_index.xml`, returned a **"Client Challenge"** page: HTTP 200, `cache-control: private, no-store`, a `set-cookie: _fs_ch_st_…; Max-Age=10`, and a JS-only challenge served from `/_fs-ch-…/`. This is Fastly's bot challenge, and a Worker's `fetch()` can't solve it.
- **atreslab.com (where the game and data lived):** no challenge. A plain GET works, but the content is gone (§2). `https://atreslab.com/robots.txt` returns 404, so there are no robots rules.
- **alexa-pasapalabra.antena3.com:** a plain GET works for the index JSON, which contains no Clues.
- Side observation: this agent's WebFetch and WebSearch tools refused `antena3.com`, `atresmedia.com` and `atresplayer.com`, saying "not accessible to our user agent". This suggests Atresmedia blocks AI crawlers at some level. It isn't a primary statement from Atresmedia.

**Conclusion:** technically a Worker *could* have fetched Clues server-side while the Rosco virtual was live. It used atreslab.com, unauthenticated, with CORS `*`. Today there is nothing left to fetch.

## 4. Legal

**Atresmedia "Advertencia Legal"** (linked from the footer of every antena3.com page): `https://statics.atresmedia.com/sites/assets/legal/legal.html`.

§1.2 Propiedad intelectual e industrial:

> "Todos los contenidos del Portal (textos, fotografías, imágenes, software, códigos fuente, etc.), son propiedad intelectual de Atresmedia o de terceros y no podrán ser reproducidos, copiados, pegados, linkados, transmitidos, distribuidos o manipulados de cualquier forma y con cualquier finalidad, sin la autorización previa y por escrito de Atresmedia […]"

> "En particular, Atresmedia se opone de manera expresa a que la reproducción de sus páginas pueda ser considerada una cita en los términos previstos en el artículo 32, 1º párrafo segundo, de la Ley de Propiedad Intelectual."

> "ATRESMEDIA CORPORACIÓN así como todas sus empresas filiales, realiza una reserva expresa de los derechos de propiedad intelectual con respecto a las reproducciones y extracciones de obras y otras prestaciones accesibles de todos sus sites y sitios Web para fines de minería de textos y datos a través de medios de lectura mecánica u otros medios […] así como para entrenar un sistema de aprendizaje automático o de inteligencia artificial (IA) […]"

> "En consecuencia, salvo que exista un acuerdo para ello, queda prohibida expresamente su reproducción, distribución, comunicación pública -incluida la puesta a disposición del público- o transformación […]"

The same page names who to ask for permission: "Para pedir autorización para el uso de contenidos de Atresmedia, puede formular la petición a través del siguiente enlace: https://portalventas.atresmedia.com/". Infringement reports go to `pirateria@atresmedia.com`.

§1.4 also restricts linking: a link may point only to the portal's home page and may not reproduce it ("inline links, copia de los textos, gráficos, etc").

**robots.txt.**
- `https://www.antena3.com/robots.txt` has `User-agent: *`, and none of its `Disallow` rules covers `/programas/pasapalabra/`. Robots doesn't forbid crawling these paths, but it grants no rights either, and the legal notice above still applies.
- `atreslab.com/robots.txt` returns 404.
- The data endpoint itself sent `x-robots-tag: noindex, nofollow` (archived headers).

**The Rosco format itself.** Secondary sources (eldiario.es, ara.cat, elespanol.com, formulatv.com, found via web search) report that a Supreme Court ruling gave the rights to El Rosco to MC&F rather than ITV/Antena 3. They also report that Antena 3 aired its last Rosco on 18 June 2026 and removed 1,540 episodes containing it from Atresplayer. **I did not verify this against the ruling itself (CENDOJ) or an Atresmedia statement.** The first-party evidence I could check fits it: the Rosco sections were removed and redirected around 14–19 June 2026, the Rosco virtual data was withdrawn, and AlaZ replaced it from 19 June 2026 (Atresmedia's own article `https://www.antena3.com/programas/pasapalabra/que-consiste-alaz-asi-juega-nueva-prueba-final_202606196a358fd39f03cb0254d6440a.html`). This bears on the whole app, not only this option. See the open questions below.

## 5. First-party alternatives

From the archived `/juego/` landing page (Wayback `20260518123400`):

- **Official app:** `https://apps.apple.com/es/app/pasapalabra/id6450698466` and `https://play.google.com/store/apps/details?id=com.MomentumGames.Pasapalabra`. Both are **gone today**: the iTunes lookup API returns `resultCount: 0` for ES, US, BR and MX, and Google Play returns 404.
- **Alexa skill** "Pasapalabra" (`amzn1.ask.skill.453d48ee-da2c-40ba-ad90-0935512b340e`), "nuevos roscos cada semana". Its backend index is the `alexa-pasapalabra.antena3.com` JSON from §2. I didn't check whether the skill still serves Roscos; that would need an Alexa device.
- **No public API or developer programme** turned up in anything I inspected. `api-pasapalabra.antena3.com` returns 404/503.
- **Licensing:** the only route the primary sources name is Atresmedia's content sales portal, `https://portalventas.atresmedia.com/` (from the legal notice). I didn't explore it. Given §4, rights to the Rosco format itself may sit with MC&F rather than Atresmedia.

## 6. El Rosco sound effects

The game page loaded its audio as plain `<audio>` elements, and one sound through `$.playSound(...)`. Sources: archived game HTML `20240517182202` / `20260616101627` and `scripts.js?2` (`20250707135911`).

| File | Plays on | Format | Size (from Wayback capture) | Live 2026-10-03 |
|---|---|---|---|---|
| `https://atreslab.com/modulosblancos/static/roscos-pasapalabra/assets/acierto.mp3` | Hit (`$(".sonidoacierto")[0].play()` in `comprobarRespuesta`) | MP3, 192 kbps, ID3v2.3 + Adobe XMP | 68,746 B (≈2.9 s) | **404** |
| `…/assets/fallo.mp3` | Miss (`$(".sonidofallo")[0].play()`) | MP3, 192 kbps | 50,592 B (≈2.1 s) | **404** |
| `…/assets/paso.mp3` | Pasapalabra (`$.playSound(…/paso.mp3)` in `pasapalabra()`) | MP3, 128 kbps, mono, 44.1 kHz | 3,439 B (≈0.2 s) | **404** |
| `…/assets/tension.mp3` | Background loop from the start of the Rosco (`<audio loop>`, `.sonidotension.play()` in `cargarRosco`), stopped in `roscoEnd` | MP3, 192 kbps | 2,848,708 B (≈119 s) | **404** |

Durations are worked out from size ÷ bitrate. I didn't decode the files. They were fetched to a scratch folder outside the repo only to read their headers.

- **There is no tick sound and no countdown.** The web game's clock counts *up* (`cuentaAtras` is a stopwatch: `contador_s++`), and no audio is tied to the last 5 seconds. The show's last-seconds tick is not in this game.
- **Fetchable without cookies or a browser?** While live, yes: they were plain static files on atreslab.com with no challenge. Today they return 404 and survive only in the Internet Archive.
- **Legal:** the same §1.2 clause covers them. "Todos los contenidos del Portal (textos, fotografías, imágenes, software, códigos fuente, etc.)" may not be "reproducidos, copiados, … distribuidos" without written permission. The clause doesn't name audio, but its list is open-ended ("etc."), and the closing ban on "reproducción, distribución, comunicación pública … o transformación" applies to "obras y otras prestaciones". The show's music and effects may also belong to third parties (the clause says "de Atresmedia o de terceros"). Reusing them would need permission. Making our own sounds that are *similar in spirit* avoids the copying problem.

## Verified vs not verified

**Verified (primary: live first-party responses or Wayback captures of first-party URLs):**
- the Rosco virtual existed and has been removed
- the endpoints, request and response format, client-side answer check and weekly cadence
- the index JSON is still live
- the Fastly challenge on antena3.com
- robots.txt contents
- the legal notice wording
- the audio file URLs, events and sizes
- the app links have disappeared

**Not verified:**
- the Supreme Court ruling and its exact scope (secondary press only)
- whether the Alexa skill still works
- what `portalventas.atresmedia.com` offers
- whether the Atresplayer apps contain any Rosco game (not inspected)
- whether the show's final Roscos (through 18 June 2026) appeared in the web game after 8 June
- the exact live status of `/programas/pasapalabra/juego/` (it sits behind the challenge)

## Open questions for the design grilling

1. **Does the reported ruling affect the app as a whole?** If the Rosco format belongs to MC&F, then a public "El Rosco" clone named "Pasapalabra" is exposed regardless of where the Clues come from. Do we need to check the ruling (CENDOJ) and decide on naming and branding before anything else?
2. With no live source, is an "Official" Difficulty still worth doing? The only remaining data is scattered Wayback captures, which would still be Atresmedia's copyrighted Clues used without permission.
3. Would we ask Atresmedia (portalventas) and/or MC&F for a licence? Is this project public or private/family-only? That changes the risk, but not what the legal notice says.
4. If the aim is "TV-style Clues", could we get there by tuning our generator instead (ADR 0004)? For example, prompting in the official house style: dictionary-like definitions, several accepted answers, "Contiene" for Ñ/X/Y. The archived samples show the style without us copying them.
5. Our Clue model has one answer per Clue. The official format allows several accepted answers (`"Alboroto,Algarabía"`). Should our Clue model, and the Host's judging, support alternative answers?
6. Sounds: make or commission our own Hit/Miss/Pasapalabra effects and a 5-second tick (or use CC0 sounds)? The official set has no tick anyway.
