# Zboruri ✈️

Twice a day, this checks **every Wizz Air route out of Chișinău (RMO)** for cheap **return trips**. When it finds new ones it sends them to you on **Telegram** and updates a small **departures-board website**.

Everything runs on free tiers: GitHub Actions does the scheduling, GitHub Pages hosts the site, and Telegram delivers the alerts. There's no server and no API key.

```
GitHub Actions (08:00 + 21:00)
  └─ node src/index.js
       ├─ wizzair.com        → routes from RMO + daily fare calendar (both directions)
       ├─ open.er-api.com    → MDL → EUR rate
       ├─ builds round trips (2–10 nights, ≤ €60 total)
       ├─ Telegram bot       → message with the *new* deals only
       └─ commits docs/data/deals.json → GitHub Pages site
```

## Setup (about 10 minutes)

### 1. Put it on GitHub

Create a **public** repository (public repos get free Pages and unlimited Actions minutes) and push this folder to it.

### 2. Turn on the website

In the repository, go to **Settings → Pages → Build and deployment**. Set **Source** to *Deploy from a branch*, then pick **Branch** `main` and folder `/docs`.

Your site will be at `https://<your-username>.github.io/<repo-name>/`.

### 3. Create the Telegram bot

1. In Telegram, open **@BotFather**, send `/newbot`, and follow the prompts. Copy the **token** it gives you, which looks like `123456:ABC-...`.
2. Open a chat with your new bot and send it any message, for example `hi`.
3. In a browser, open `https://api.telegram.org/bot<TOKEN>/getUpdates`. Find `"chat":{"id":123456789` and copy that number: it's your **chat id**.

### 4. Add the secrets

Go to **Settings → Secrets and variables → Actions → New repository secret** and add:

| Name                 | Value              |
| -------------------- | ------------------ |
| `TELEGRAM_BOT_TOKEN` | the BotFather token |
| `TELEGRAM_CHAT_ID`   | your chat id       |

### 5. Run it once

Go to **Actions → Scan flights → Run workflow**. A scan takes about 5 minutes. After that it runs by itself every morning and evening.

The first run sends every destination that currently has a deal, split into a few messages of up to 10 destinations each. After that you only hear about a destination when it **newly** has a deal, or when its cheapest deal gets **at least €1 cheaper**. A destination that drops out of deals and comes back counts as news again.

If the secrets are missing, the run fails with a message telling you to add them. The website still updates.

## Settings — `config.json`

| Key                      | Default | Meaning                                                     |
| ------------------------ | ------- | ----------------------------------------------------------- |
| `origin`                 | `RMO`   | Departure airport (must be a Wizz Air airport)              |
| `maxReturnPriceEur`      | `60`    | A trip counts as a deal at or below this total price        |
| `minNights`, `maxNights` | `2`, `10` | Length of stay                                            |
| `daysAhead`              | `120`   | How far ahead to search (max 365)                           |
| `maxDealsPerDestination` | `5`     | Cheapest date combinations kept per destination             |
| `requestDelayMs`         | `1200`  | Pause between requests, so Wizz Air doesn't rate-limit us   |

To change the schedule, edit the two `cron` lines in [.github/workflows/scan.yml](.github/workflows/scan.yml). They're in UTC.

## Run it on your computer

Requires Node 22 or newer. There are no dependencies to install.

```bash
npm test          # unit tests
npm run coverage  # tests + coverage report (80% minimum)
npm run scan      # real scan; add TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID env vars to also send alerts
npm run site      # preview the website at http://localhost:8080
```

## Good to know

- **Only Wizz Air is covered.** It's the main low-cost airline at RMO. Ryanair doesn't fly there (their fares API returns nothing for RMO). FlyOne, HiSky and legacy carriers aren't included.
- **Prices are Wizz Air's cheapest *Basic* fare**: 1 adult, one small under-seat bag, converted from MDL at the day's rate. Always confirm on wizzair.com before booking.
- **This uses the same unofficial API the Wizz Air website uses.** If they change it or block GitHub's servers, the workflow fails and GitHub emails you. The run log says what went wrong.
- **Rate limiting:** Wizz Air sometimes returns HTTP 503 during a scan. Those routes are retried with back-off and again after a one-minute cool-down. Routes that still fail are listed at the bottom of the website. After 5 failures in a row the scan stops early, so the run fails fast instead of timing out.
- **Paused schedules:** GitHub pauses scheduled workflows in repositories with no activity for 60 days. The bot's own commits normally count as activity. If you ever get an email saying the workflow was disabled, re-enable it in the Actions tab.

## Project layout

```
src/
  index.js      wiring: real HTTP, files, env vars
  run.js        one scan: fetch → build trips → alert → publish
  wizz.js       Wizz Air API client + response parsing
  scan.js       per-destination scanning with a retry pass
  deals.js      fares → round trips → cheapest deals (pure)
  state.js      which deals were already alerted (pure)
  telegram.js   message formatting + Bot API
  site-data.js  JSON for the website
  fx.js dates.js http.js config.js store.js
docs/           the GitHub Pages site (index.html, styles.css, app.js, data/deals.json)
data/state.json alert history (per destination), so you aren't told about the same deal twice
test/           node:test unit tests
```
