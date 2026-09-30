<p align="center"><img src="docs/assets/logo-mark.svg" width="96" alt="Zboruri logo"></p>

# Zboruri ✈️

Twice a day, this checks **every flight route out of Chișinău (RMO)** for cheap **return trips**. When it finds new ones it sends them to you on **Telegram** and updates a premium **deals dashboard** website.

- **Live Wizz Air fares:** every Wizz Air route, read from their own fare calendar.
- **Every other airline (optional):** Fly One, HiSky, Ajet, Turkish, LOT, Lufthansa and more, through the free Travelpayouts / Aviasales Data API.

Everything runs on free tiers: GitHub Actions does the scheduling, GitHub Pages hosts the site, and Telegram delivers the alerts.

```
GitHub Actions (08:00 + 21:00)
  └─ node src/index.js
       ├─ wizzair.com         → routes from RMO + daily fare calendars (live prices)
       ├─ Travelpayouts API   → cached round-trip prices for all other airlines (optional)
       ├─ open.er-api.com     → MDL/RON/USD ↔ EUR rates
       ├─ merges + builds round trips (2–10 nights, ≤ €60 total), fare calendars, price history
       ├─ Telegram bot        → message with *new or cheaper* destinations only
       └─ commits docs/data/*.json → GitHub Pages dashboard
```

## The website

The site at `https://<you>.github.io/<repo>/` is a flight search in the style of Skyscanner, built over the scanner's data. The scanner publishes every day's one-way fares (`docs/data/fares.json`), so the page can pair any dates you choose.

- **Search widget:** From · To · Depart · Return · Travellers.
  - **To:** destination autocomplete (flags, airports, "from €X" prices), or "Everywhere".
  - **Depart:** a specific day on a two-month **price calendar** (cheap / average / higher days coloured), a whole month, or anytime.
  - **Return:** a trip-length range, or an exact return date on its own price calendar.
  - **Travellers:** number of adults; totals are shown for everyone.
- **Results:**
  - **Best / Cheapest / Soonest** tabs, each with its top price.
  - A **date strip** with the cheapest price for each departure day, and a cheapest-month bar chart.
  - Flight cards: departure time → estimated arrival, flight time, direct, airline, price per person and total.
- **Filters:** outbound and return departure times (with counts), airlines (with their lowest price), max price, and weekend trips only.
- **Everywhere:** every destination with its best trip for your dates, as picture cards.
- **Flight details:**
  - A timeline with full airport names and local times across time zones.
  - What the Wizz Air Basic fare includes.
  - Destination facts: local time, time difference, distance, flight time, currency.
  - A change-dates calendar and price history.
  - **Book**, **Share** and **Add to calendar** (`.ics`).
- **Home:** cheapest destinations, weekend escapes, cheapest months to fly, a route map and an FAQ.
- **Currency switch** (EUR / MDL / RON / USD). Every search is a **shareable link**.

Departure times are real. Arrival times and flight durations are estimated from distance and time zones, and marked "≈".

### Ask in plain English or Romanian

The **Ask** box at the top turns a sentence into a real search. For example: *"beach next week under €80"*, *"weekend în Italia pentru 2"*, *"munte în decembrie"*, *"cel mai ieftin zbor la Londra"*.

1. **Instant understanding** (`docs/js/nl-parser.js`) works with no setup. It knows dates (next week, weekends, months, Crăciun), themes (beach/mare, mountains/munte, ski, city break, Christmas markets…), budgets in € or lei, trip length, travellers, and city and country names in both languages.
2. **Gemini** handles free-form requests the rules can't ("somewhere warm with good food"). It runs in a Cloudflare Worker (`worker/`), so your Gemini key never reaches the browser.

Either way, the answer is checked (`docs/js/intent.js`): unknown airports are dropped, and dates and numbers are clamped. The results always come from the real fares. The AI only decides what to search for.

#### Turn on Gemini (free)

1. Create a free API key at [aistudio.google.com](https://aistudio.google.com/apikey). The Gemini app subscription doesn't include API access, but the API's free tier is plenty for this.
2. Create a free Cloudflare account, then in a terminal:
   ```bash
   cd worker
   npx wrangler login                        # opens the browser once
   npx wrangler secret put GEMINI_API_KEY    # paste the key when asked
   npx wrangler deploy                       # prints https://zboruri-ai.<you>.workers.dev
   ```
3. Put that address plus `/api/search` in `docs/js/config.js` (`AI_ENDPOINT`), then commit.

The Worker only answers requests from your site (`ALLOWED_ORIGINS` in `worker/wrangler.toml`). It limits each visitor to 20 requests a minute, and it never returns Gemini's error details. With a free-tier key there's no bill to run up; the worst case is hitting the daily quota. When that happens, the site quietly falls back to instant understanding.

## Setup

### 1. Put it on GitHub

Create a **public** repository (public repos get free Pages and unlimited Actions minutes) and push this folder to it.

### 2. Turn on the website

In the repository, go to **Settings → Pages → Build and deployment**. Set **Source** to *Deploy from a branch*, then pick **Branch** `main` and folder `/docs`.

### 3. Create the Telegram bot

1. In Telegram, open **@BotFather**, send `/newbot`, and follow the prompts. Copy the **token** it gives you, which looks like `123456:ABC-...`.
2. Open a chat with your new bot and send it any message, for example `hi`.
3. In a browser, open `https://api.telegram.org/bot<TOKEN>/getUpdates`. Find `"chat":{"id":123456789` and copy that number: it's your **chat id**.

### 4. (Optional) Turn on every other airline

1. Sign up for free at [travelpayouts.com](https://www.travelpayouts.com).
2. Join the **Aviasales** program.
3. Copy your **API token** from **Profile → API token**.
4. Your **marker** (partner ID) is optional. Bookings made through the links then earn you a commission.

### 5. Add the secrets

Go to **Settings → Secrets and variables → Actions → New repository secret**:

| Name                   | Value                         | Required |
| ---------------------- | ----------------------------- | -------- |
| `TELEGRAM_BOT_TOKEN`   | the BotFather token           | yes      |
| `TELEGRAM_CHAT_ID`     | your chat id                  | yes      |
| `TRAVELPAYOUTS_TOKEN`  | Travelpayouts API token       | for other airlines |
| `TRAVELPAYOUTS_MARKER` | Travelpayouts partner marker  | optional |
| `PEXELS_API_KEY`       | Pexels API key ([pexels.com/api](https://www.pexels.com/api/)) | for destination photos |

Destination photos come from Pexels. The scanner fetches one landscape photo per destination with the key, and caches it (with the photographer credit) in `docs/data/photos.json`. After the first run it only asks Pexels about new destinations. The key never reaches the website: the site only loads the image URLs.

### 6. Run it once

Go to **Actions → Scan flights → Run workflow**. A scan takes about 5 minutes. After that it runs by itself every morning and evening.

The first run sends every destination that currently has a deal, split into messages of up to 10 destinations each. After that you only hear about a destination when it **newly** has a deal, or when its cheapest deal gets **at least €1 cheaper**.

Missing Telegram secrets, or a rejected Travelpayouts token, make the run fail with a clear message. The website still updates.

## Settings — `config.json`

| Key                      | Default   | Meaning                                                      |
| ------------------------ | --------- | ------------------------------------------------------------ |
| `origin`                 | `RMO`     | Departure airport (must be a Wizz Air airport)               |
| `maxReturnPriceEur`      | `60`      | A trip counts as a deal at or below this total price         |
| `minNights`, `maxNights` | `2`, `10` | Length of stay                                               |
| `daysAhead`              | `120`     | How far ahead to search (max 365)                            |
| `maxDealsPerDestination` | `10`      | Cheapest date combinations kept per destination              |
| `requestDelayMs`         | `1200`    | Pause between Wizz Air requests, so they don't rate-limit us |
| `directFlightsOnly`      | `true`    | Other airlines: only direct flights (no connections)         |

To change the schedule, edit the two `cron` lines in [.github/workflows/scan.yml](.github/workflows/scan.yml). They're in UTC.

## Run it on your computer

Requires Node 22 or newer. There are no dependencies to install.

```bash
npm test          # unit tests
npm run coverage  # tests + coverage report (80% minimum)
npm run scan      # real scan; set TELEGRAM_* / TRAVELPAYOUTS_* env vars to include alerts / other airlines
npm run site      # preview the website at http://localhost:8080
```

## Good to know

- **Live vs cached prices:** Wizz Air prices are live, the cheapest *Basic* fare for 1 adult with a small under-seat bag. Other airlines' prices come from searches people made recently (up to about 2 days old), so the site labels them "check price". Always confirm before booking.
- **Ryanair** doesn't fly from RMO. Its fares API returns nothing for Chișinău.
- **Wizz Air's API is unofficial:** it's the same one their website uses. If they change it or block GitHub's servers, the workflow fails and GitHub emails you. The run log says what went wrong.
- **Rate limiting:** Wizz Air sometimes returns HTTP 503 mid-scan. Those routes are retried with back-off and again after a one-minute cool-down. After 5 failures in a row the scan stops early instead of timing out.
- **Paused schedules:** GitHub pauses scheduled workflows in repositories with no activity for 60 days. The bot's own commits normally count as activity.

## Project layout

```
src/
  index.js          wiring: real HTTP, files, env vars
  run.js            one scan: Wizz + other airlines → merge → alert → publish
  wizz.js           Wizz Air API client + parsing        travelpayouts.js  other airlines (Aviasales Data API)
  scan.js           per-destination scanning + retries   other-airlines.js optional second source, never fatal
  merge.js          combine sources per destination       deals.js          round trips, summaries, fare calendar
  state.js          alert history (per destination)      history.js        daily price history
  telegram.js       message formatting + Bot API          site-data.js      JSON for the website
  fx.js dates.js http.js config.js store.js
docs/               the GitHub Pages dashboard: index.html, css/, js/, assets/ (logo, icons, social card), data/
data/state.json     alert history, so you aren't told about the same deal twice
test/               node:test unit tests
```
