# Zboruri handbook

Everything about this project in one place: what it is, how it works, how to run and change it, and what's still open.
Last updated: 1 October 2026.

---

## 1. What Zboruri is

Zboruri ("flights" in Romanian) finds **cheap return flights from Chișinău (RMO)** to anywhere. Twice a day it checks every route, publishes a flight-search website, and is meant to send new deals to Telegram.

- **Website:** https://xzsthle.github.io/zboruri/
- **Code:** https://github.com/xzsthle/zboruri (public repo, branch `main`)
- **A "deal":** a return trip of **€60 or less** per person (`maxReturnPriceEur` in `config.json`).
- **Cost:** €0. GitHub Actions runs the scans, GitHub Pages hosts the site, and the Cloudflare Worker, Gemini, Pexels and Travelpayouts are all used on free tiers.

What a visitor can do on the site:

- **Search flights** from Chișinău by destination, dates, trip length and number of travellers.
- **Use the price calendars** to find the cheapest days.
- **Browse "Everywhere"**: every destination with its best price.
- **Filter results** by stops, departure times, airline, price and weekend trips.
- **Open the flight details**: itinerary, fare rules, price history, and links to book, share or add to a calendar.
- **Ask in plain English or Romanian** (Gemini), for example "beach next week under €80".
- **Switch currency** (EUR, MDL, RON, USD) and share any search as a link.

---

## 2. How it works (big picture)

```
GitHub Actions — "Scan flights", 05:00 and 18:00 UTC (+ "Run workflow" button)
  └─ npm test, then node src/index.js
       ├─ wizzair.com (unofficial API) → live Wizz Air fares for every route from RMO
       ├─ Travelpayouts / Aviasales API → cached fares for all other airlines, direct and with stops
       ├─ Travelpayouts public data      → airport/city names, coordinates, time zones, airline names
       ├─ open.er-api.com                → exchange rates (MDL, RON, USD ↔ EUR)
       ├─ builds round trips, deals (≤ €60), fare calendars, price history
       ├─ Pexels API                     → one photo per new destination (cached)
       ├─ Telegram Bot API               → message with new/cheaper deals (NOT CONFIGURED YET)
       └─ commits docs/data/*.json + data/state.json → GitHub Pages redeploys the site

Website (docs/, static, no build step) ── reads docs/data/*.json, searches in the browser
  └─ "Ask" box → Cloudflare Worker zboruri-ai.zboruri.workers.dev → Gemini (key stays secret there)
```

---

## 3. Data sources and their quirks

### Wizz Air (live prices)
- Unofficial API, the same one wizzair.com uses. The API version is scraped from the wizzair.com homepage.
- `/Api/asset/map` gives the route map; `/Api/search/timetable` gives daily fares in 42-day windows. Prices come in MDL and are converted to EUR.
- It answers bursts with HTTP 503. The scanner pauses 1.2 s between requests, retries with back-off, retries again after a one-minute cool-down, and stops early after 5 failures in a row.
- `/Api/search/search` (exact times) is Akamai-protected, so **arrival times and flight durations for Wizz Air are estimated** from distance and time zones, and shown with "≈".
- Wizz Air's sister airlines in other airlines' data (W4 Wizz Air Malta, W9 Wizz Air UK, 5W Abu Dhabi) are treated as Wizz Air. Where live data exists, their cached duplicates are dropped.

### Other airlines (Travelpayouts / Aviasales Data API)
- Endpoint `https://api.travelpayouts.com/aviasales/v3/prices_for_dates`, called with only `origin=RMO` (all destinations), one call per departure month, `direct=false`, `limit=1000`. The token goes in the `X-Access-Token` header.
- These are **cached prices** that Aviasales users saw in roughly the last two days, so the site labels them "Recent". A route nobody searched recently won't appear.
- Each trip keeps stops and journey minutes **per direction** (`transfers`, `return_transfers`, `duration_to`, `duration_back`). The API doesn't say where the stop is.
- Rules in the code:
  - Journeys with 3+ stops in either direction are dropped.
  - Only the **40 cheapest trips per destination** are kept.
  - Booking links are trimmed to `https://www.aviasales.com/search/...?t=<ticket>` plus `marker` if set.
- Airlines seen so far: Pegasus, Wizz Air, TAROM, HiSky, FlyOne, LOT, Azerbaijan Airlines, Turkish, Austrian, Aegean, Freebird.
- The public reference files (`https://api.travelpayouts.com/data/en/{airports,cities,countries,airlines}.json`) need no token and place new destinations on the map.

### Other services
- **Exchange rates:** open.er-api.com (free, no key).
- **Photos:** Pexels API. The key lives only in GitHub secrets.
  - At most 60 new photos per run (Pexels allows 200 requests an hour).
  - Cached with photographer credits in `docs/data/photos.json`.
  - The site only loads `images.pexels.com` URLs, resized on the fly up to 3× for sharp screens.
- **Gemini:** through the Cloudflare Worker (section 7).

Not available: Ryanair doesn't fly from RMO. FlyOne's own site uses a private booking engine. HiSky blocks bots. Both FlyOne and HiSky do come through Travelpayouts.

---

## 4. The scanner (`src/`)

Node 22, ES modules, **zero dependencies**, tests with `node:test`.

| File | Job |
|---|---|
| `index.js` | Wiring: env vars, real HTTP, file paths. Optional clients switch on only when their secret exists. |
| `run.js` | One scan: Wizz → other airlines → merge → deals → alerts → write data files → photos. |
| `wizz.js`, `scan.js` | Wizz Air API client; per-destination scanning with retries. |
| `travelpayouts.js` | Travelpayouts client, `parsePrices` (stops, minutes, link trimming), reference data. |
| `other-airlines.js` | Optional second source, never fatal; `capPerDestination` (40). |
| `merge.js` | Combines live Wizz + cached others per destination; Wizz-group dedupe. |
| `deals.js` | Round trips, `summarizeTrips` (cheapest, deals, calendar, airlines, `direct` flag). |
| `state.js` | Alert memory: alert when a destination newly has a deal or gets at least €1 cheaper. |
| `history.js` | Daily cheapest price per destination (price-history chart). |
| `site-data.js` | Builds `deals.json` and `fares.json`. |
| `photos.js` | Pexels search and cache. |
| `telegram.js` | Alert formatting (up to 10 destinations per message, shows airline and stops) and sending. |
| `fx.js`, `dates.js`, `http.js`, `config.js`, `store.js` | Helpers. |

If Telegram secrets are missing, the run **ends red on purpose**, after the site data has already been committed. So a red ✗ in Actions doesn't mean the site didn't update; read the log.

### Data files

| File | Contents |
|---|---|
| `docs/data/deals.json` | Destinations with cheapest trip, deals, fare calendar, airlines, `direct` flag; rules; exchange rates; sources. |
| `docs/data/fares.json` | Per destination: Wizz one-way legs per day (`out`/`back`, paired in the browser) plus `cached` round trips from other airlines. |
| `docs/data/history.json` | Cheapest price per destination per day. |
| `docs/data/photos.json` | One Pexels photo per destination (URL base, size, average colour, photographer, page link). |
| `data/state.json` | Alert history, so the same deal isn't sent twice. |

---

## 5. The website (`docs/`)

Plain HTML, CSS and ES modules. **No framework, no build step, no dependencies.** GitHub Pages serves `main:/docs`.

| Module | Job |
|---|---|
| `main.js` | Loads the data, routes by URL hash, currency, nav state. |
| `engine.js` | In-browser search: pairs Wizz one-way fares for any dates, blends cached trips, filters (stops, times, airline, price, weekend), sorts (best, cheapest, soonest), price maps for calendars. |
| `query.js` | URL hash ⇄ query + filters. |
| `widget.js`, `pickers.js` | Search bar, popovers, calendars, the phone summary pill. |
| `results.js`, `sidebar.js`, `card.js`, `months.js` | Results page, filters (bottom sheet on phones), flight cards, month bars. |
| `details.js`, `history-chart.js`, `actions.js` | Flight-details dialog, price history, share and calendar (.ics). |
| `home.js`, `map.js` | Home bento, weekends, months, how-it-works, route map (direct routes only). |
| `flight.js`, `geo.js`, `format.js`, `photo.js`, `art.js`, `dom.js`, `data.js` | Helpers. Labels like "Direct / 1 stop", "≈" only for estimates, responsive photos, colour-block fallback art. |
| `ask.js`, `ai.js`, `nl-parser.js`, `intent.js`, `themes.js`, `config.js` | The Ask box: an instant parser (no network) first, then Gemini via the Worker. Everything is validated before searching. |

**URL format** (every search is shareable):
`#/search?to=SOF&depart=2026-10&back=&min=2&max=10&adults=1&others=0&sort=cheapest&air=…&dep=morning&ret=…&maxp=50&wknd=1&stops=0,1&label=…&note=…`
- `to` is an airport code, a comma list, or empty for everywhere.
- `depart` is `anytime`, a month, a date, or `from..to`.
- `stops` is `0` direct, `1` one stop, `2` two or more.

### Design system (redesign of 30 September 2026)
- **Look:** a monochrome bento layout on a light grey canvas (`#efeff1`), white tiles, near-black ink and **one accent, ultramarine `#2b2be0`**. The accent is reserved for Search, Book, the cheapest-month bar, the logo, and one accent tile.
- **Fonts:** Instrument Sans for the interface. Archivo Expanded 800 only for the hero wordmark, the "how it works" title and fallback art codes.
- **CSS files:** `tokens.css`, `components.css`, `layout.css`, `widget.css`, `home.css`, `results.css`, `details.css`, `responsive.css`.
- **Text on photos:** always sits on dark-glass pills, so it stays readable (4.5:1 contrast). The hero photo is Pexels #39166607, an 8,256-px jet in clouds by Miguel Cuenca.
- **No per-photo credit labels** (you asked for them to be removed). The footer credits Pexels and its photographers.
- **Logo (1 October 2026):**
  - A ticket badge (a rounded blue square with a notch in each side) holding a hand-drawn plane climbing to the upper right.
  - The wordmark "zboruri" is Archivo Expanded ExtraBold outlined to paths, tracked −2%, with a blue dot on the "i".
  - Files: `docs/assets/logo.svg`, `logo-white.svg`, `logo-mark.svg`, `docs/favicon.svg`, `apple-touch-icon.png`, `og-image.png`. The header and footer use an inline copy whose word follows the text colour.
- **Security:**
  - A strict Content-Security-Policy meta tag. Scripts come only from the site itself; images from the site, `data:` and images.pexels.com; connections only to the site and `*.workers.dev`.
  - No inline scripts or styles. The page is built with `textContent`, never `innerHTML`.
  - Booking links are allowed only to wizzair.com and aviasales.com.

---

## 6. Settings (`config.json`)

| Key | Value | Meaning |
|---|---|---|
| `origin` | `RMO` | Departure airport |
| `maxReturnPriceEur` | `60` | A deal is a return trip at or under this |
| `minNights`, `maxNights` | `2`, `10` | Length of stay |
| `daysAhead` | `120` | How far ahead to search |
| `maxDealsPerDestination` | `10` | Deals kept per destination |
| `requestDelayMs` | `1200` | Pause between Wizz Air requests |
| `directFlightsOnly` | `false` | `false` = other airlines include connections (1–2 stops) |

The scan schedule is the two `cron` lines in `.github/workflows/scan.yml`, in UTC: 05:00 and 18:00, which is 08:00 and 21:00 in Chișinău in summer.

---

## 7. Accounts, secrets and services

| Thing | Where | Status |
|---|---|---|
| GitHub repo + Pages + Actions | github.com/xzsthle/zboruri | ✅ live |
| `PEXELS_API_KEY` | GitHub → Settings → Secrets → Actions | ✅ set |
| `TRAVELPAYOUTS_TOKEN` | GitHub secret | ✅ set (other airlines live since 30 Sep 2026) |
| `TRAVELPAYOUTS_MARKER` | GitHub secret | ❌ not set (affiliate commission on Aviasales links) |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | GitHub secrets | ❌ not set, so no Telegram alerts yet |
| Cloudflare Worker `zboruri-ai` | https://zboruri-ai.zboruri.workers.dev, code in `worker/` | ✅ live |
| `GEMINI_API_KEY` | Cloudflare Worker secret | ✅ set |

**The Gemini Worker** (`worker/`, deployed with wrangler):
- **What it does:** `POST /api/search` with `{ text, today, destinations, rates }` returns a validated search intent.
- **Who can call it:** only https://xzsthle.github.io and http://localhost:8080, at most 20 requests a minute per visitor, up to 500 destinations per request.
- **Errors:** it never passes Gemini's error details back; the site falls back to the instant parser.
- **Model:** `gemini-3.1-flash-lite` (in `wrangler.toml`). `gemini-2.5-flash` is closed to new API users, and the bigger Flash models often answered 503 "high demand".
- **Commands** (run in `worker/`):
  - Deploy: `npx wrangler deploy`
  - Change the key: `npx wrangler secret put GEMINI_API_KEY`
  - Log in once: `npx wrangler login`
- The site points at it in `docs/js/config.js` (`AI_ENDPOINT`).

---

## 8. Running and changing it

```bash
npm test          # 152 unit tests (scanner, site engine, Ask parser, Worker)
npm run coverage  # tests + coverage (80% minimum)
npm run site      # preview the site at http://localhost:8080
npm run scan      # a real scan on this computer (set env vars for the optional sources)

gh workflow run "Scan flights" -R xzsthle/zboruri   # run a scan now on GitHub
gh run list -R xzsthle/zboruri --limit 5            # see recent runs
```

- **Publishing the site:** push to `main` and GitHub Pages redeploys in about a minute. The scan bot also pushes to `main` twice a day, so run `git pull --rebase` before pushing.
- **Commits:** conventional messages (`feat:`, `fix:`, `style:`, `chore:`…).
- **Checking visual changes:**
  - Headless Chrome via puppeteer-core in a scratch folder (not a project dependency).
  - Screenshots at 1440×900 and 390×844 of home, `#/search?to=SOF&min=2&max=10`, `#/search?min=2&max=10`, the details dialog and the depart calendar.
  - Check the console for CSP errors, horizontal overflow from 320 to 1920 px, and text contrast on photos.
- **zsh gotcha:** in zsh, never name a shell loop variable `path`. It overwrites `$PATH`, and every command then fails.

---

## 9. What's still needed (to-do)

1. **Telegram alerts.**
   - Create a bot with @BotFather, send it a message, and get your chat id from `https://api.telegram.org/bot<TOKEN>/getUpdates`.
   - Add `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` as GitHub secrets.
   - Until then, every scan run shows red in Actions.
2. **Affiliate marker.** Add your Travelpayouts Partner ID as the `TRAVELPAYOUTS_MARKER` secret, so Aviasales links earn commission.
3. **Rotate keys that were pasted in chat.** The Gemini API key, the Pexels key and the Travelpayouts token were all shared in a chat. Create new ones and replace them:
   - Gemini: in the Worker, with `wrangler secret put`.
   - Pexels and Travelpayouts: in GitHub secrets.
4. **Travelpayouts "Drive" script (optional, undecided).** The `emrldtp.com` script that turns links into affiliate links. Not added, because:
   - it needs a looser CSP,
   - it uploads page content and watches every click,
   - Travelpayouts answered 403 for this site, which means it isn't registered or approved there.
   To add it: register `xzsthle.github.io` in Travelpayouts, then allow the domain in the CSP.
5. **GitHub Actions housekeeping.** Actions warns that `actions/checkout@v4` and `actions/setup-node@v4` target the deprecated Node 20. Bump them when v5 versions are available.
6. **Ideas not done:**
   - The stopover airport for connections (the data doesn't include it).
   - Logo alternatives, such as a green colour or the icon on the right.
   - More hero photos.

---

## 10. Decisions and why

- **Direct-only map.** Places reachable only with a stop would stretch the map across the world, so the map shows direct routes and counts the rest ("46 direct routes · 58 more with a stop").
- **"Stops" means the most stops in either direction.** A trip with 1 stop out and 0 back counts as "1 stop".
- **"≈" only for estimates.** Wizz Air times are estimated from distance; other airlines' journey times come from the fare data, so they're shown as they are.
- **Glass pills behind text on photos.** The brief's gradient scrim alone failed 4.5:1 contrast on bright photos (Brasov, Verona), so city names and titles sit on dark glass.
- **No flag emoji.** They render as "BG"/"PL" letters in Chrome on Windows. Country names are shown instead.
- **The Ask box sits below the search bar**, not on the photo. There's no room on the photo next to the wordmark.
- **The phone results page** folds the search form into a one-line summary pill and hides the months tile (the Depart popover's "Whole month" tab covers it). The first flight card is then visible without scrolling (it starts 600 px down on a 390×844 screen).
- **Hero photo:** chosen by you from high-resolution options. The old one was only 3,000 px wide and was stretched on Retina screens.

---

## 11. Timeline

| Date | What happened |
|---|---|
| 29 Sep 2026 | Scanner built (Wizz Air, deals, Telegram code), repo and Pages created. First website. Travelpayouts integration (dormant), fare calendars, price history. Skyscanner-style search site. Pexels photos. |
| 29–30 Sep | Ask box: instant English/Romanian parser plus the Gemini Worker code. |
| 30 Sep | Full visual redesign in 8 phases (tokens, shell, home, results, popovers/details, map, mobile, cleanup). Per-photo credits removed. Gemini Worker deployed on Cloudflare and connected. Connecting flights and the Stops filter added. Travelpayouts token set: 104 destinations, 58 of them only with a stop. Sharper photos and a new hero photo. |
| 1 Oct | New logo (ticket badge + plane + outlined wordmark). This handbook. |

---

## 12. Picking this up again (for Claude)

1. Read this file. It's loaded automatically through `CLAUDE.md`.
2. Check the current state:
   - `git pull`
   - `npm test`
   - `gh run list -R xzsthle/zboruri --limit 3`
   - Open the live site.
3. Check the to-do list in section 9 and ask which item to do next.
4. Rules to keep:
   - Never put keys in the repo or in client code.
   - No frameworks or build step for the site.
   - Keep the strict CSP.
   - Text on photos needs at least 4.5:1 contrast.
   - Update this handbook when something important changes.
