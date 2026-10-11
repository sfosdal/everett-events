# Everett Events

Event feed and calendar for Everett, WA: Angel of the Winds Arena, Funko
Field (AquaSox), APEX Everett, the Port of Everett waterfront, Village
Theatre, the downtown bars — and the home teams' seasons (Silvertips,
AquaSox, Wolfpack, with the Everett CC Trojans' home games in the listing).

Live at **https://everett.here.events/** (the old fosdal.net/everett-events/
address redirects there) — a GitHub Actions cron refreshes the data every ~6
hours and deploys straight to GitHub Pages (no data commits).

## Sister sites

This is [lqa-events](https://github.com/sfosdal/lqa-events) (Lower Queen Anne,
Seattle) with another city plugged in. The shared files are lqa-events' own,
byte for byte, and are refreshed from there — never edited here:

- `site/app.js`, `site/filter.js`, `site/qrcode.js`, `site/channels.json`
- `site/styles.css` — except the `--v-*` venue hues at the top of each colour block
- `scripts/*.mjs` apart from `fetch-events.mjs` and `sources.mjs`, and every
  `scripts/*.test.mjs` apart from `sources.test.mjs` (the cases that assert
  Lower Queen Anne's own data skip themselves when the city isn't `lqa`)

What is Everett's: `site/city.js` (every team, venue, type, default, share-code
slot and phrase — the one place a venue or team is named), `site/index.html`
(the shell: titles, masthead, panel headings, Sources, embed snippet),
`scripts/fetch-events.mjs` (the source list), `scripts/sources.mjs` (the
parsers), `site/embed.js` (its own ids and class prefix), `site/outlook.json`,
`scripts/data/postseason.json`, the icons and the manifest.

## What it publishes

| Path | What |
|---|---|
| `/` | Calendar UI — list, month grid and Teams views, venue/type/team filters, subscribe, share links |
| `/events.json` | JSON feed: `{ generated, events: [{venue,title,date,time,url,type?,…}] }` |
| `/events.ics` | iCalendar feed — subscribable in Google/Apple/Outlook |
| `/teams.json` | The home teams' seasons, records and news (the Teams view) |
| `/embed.js` | Drop-in widget for other sites |

Filtered feeds: `events-venue-<slug>.ics` per venue, `events-{21plus,day,soldout,free}.ics`
per badge, `events-no-<team>.ics` team-exclusion feeds, `team-<slug>.ics` per
season and `teams.ics` for every season in one.

Embed on any site:

```html
<div id="everett-events"></div>
<script src="https://everett.here.events/embed.js" data-max="8" defer></script>
```

Options via data-attributes: `data-max`, `data-venue`, `data-target`,
`data-nostyle`. Output uses `evt-ev-*` classes for restyling.

## Sources

Events:

- **Ticketmaster Discovery API** — Angel of the Winds Arena, APEX Everett,
  Tulalip Resort Casino and Edmonds Center for the Arts by venue id (every
  page), plus a city=Everett sweep for everything else on
  sale in town (Funko Field, whatever books next; church events are dropped
  at every source, see `isChurch`). Resale-only listings are kept
  only when no primary one shares the date. Needs the `TICKETMASTER_API_KEY`
  repo secret (locally, an untracked `.env`).
- **CivicPlus calendars** — the City of Everett, Marysville, Mukilteo and
  Snohomish sites and the Everett Public Library publish the month's events
  as RSS (`RSSFeed.aspx?ModID=58&CID=All-calendar.xml`); council, board and
  commission meetings are dropped (`isMeeting`). The City of Everett's site
  sits behind a bot wall, so it is fetched through `scripts/cffi-fetch.py`
  (curl_cffi, as Chrome; `uv run` locally, `pip install curl_cffi` in
  Actions).
- **Sno-Isle Libraries** — the BiblioCommons events gateway, every page,
  kept to the branches a short drive from Everett (Mukilteo, Mariner, Mill
  Creek, Snohomish, Lake Stevens, Marysville, Lynnwood, Edmonds).
- **Squarespace calendars** — Schack Art Center (classes and workshops) and
  Scuttlebutt Brewing (weekly nights), `?format=json` like the EMI and Late
  Shift feeds.
- **Historic Downtown Snohomish** — the Wix calendar's event pages, read
  from their schema.org Event markup.
- **City of Mill Creek** — the Drupal events list, each event's page for its
  time.
- **Historic Everett Theatre** — Songkick's venue page (schema.org Event
  markup, behind a bot wall) while the theatre's own site is down.
- **Port of Everett calendar** — the Revize CMS app's plain XML data files
  under `/calendar_app/db/` (month index + per-month events; repeat events
  expanded from their explicit dates list). Public, no key.
- **NWAC** (nwacsports.com, PrestoSports) — each sport's schedule page answers
  `?print=ical` with the whole conference's season; `parseNwacIcal` keeps the
  Everett CC Trojans' home games. Baseball and softball appear once published.
- **Everett Music Initiative** and **Late Shift Everett** — Squarespace sites;
  `?format=json` on a collection page gives its rendered listing. Their DICE /
  Eventbrite / free shows never reach Ticketmaster: El Sid's weekly nights,
  Lucky Dime, Village Theatre runs, Kings Hall shows. Run as *secondary*
  sources: anything at a venue/date/time a primary already holds is dropped.

Seasons (`scripts/schedules.mjs`, the kinds `city.js` names — none of these
clubs is on ESPN):

- **Silvertips** — the WHL's HockeyTech stat feed (`client_code=whl`, the key
  chl.ca's pages carry): schedule, results, standings; the same feed shape the
  PWHL publishes through.
- **AquaSox** — MLB's stats API with `sportId=13`: schedule with first-pitch
  times and broadcasts, standings by `leagueId=126` (Northwest League). The
  home dates enter the listing from here too (`inject`), filling the times
  Ticketmaster's listings lack.
- **Wolfpack** — Arena Football One's DigitalShift stats host: a login with the
  site's public client id returns a ticket, `/events?team_id=` the games.
- News: The Herald's team tags, MiLB.com's club RSS, the Wolfpack's news.rss.

## Layout

- `scripts/fetch-events.mjs` — aggregates the sources into `site/events.json`,
  the `.ics` feeds and `site/teams.json`; carries past events forward from the
  live feed and the `archive` branch (every past event ever published, which
  the workflow rewrites after each build).
- `scripts/*.mjs` — the shared pipeline (badges, ics, merge, titles,
  schedules, marks, highlights), tested by `scripts/*.test.mjs`
  (`node --test scripts/*.test.mjs`).
- `site/` — static UI (no framework, no third-party services; QR codes via
  vendored MIT `qrcode.js`). Deployed as-is by the workflow.
- `.github/workflows/events.yml` — test → fetch → archive branch → stamp asset
  versions → deploy to Pages, once a day at noon Pacific + push + manual dispatch.
