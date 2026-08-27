# Everett Events

Event feed and calendar for Everett, WA: Angel of the Winds Arena, Funko
Field (AquaSox), APEX Everett, and the waterfront.

Live at **https://fosdal.net/everett-events/** — a GitHub Actions cron
refreshes the data every ~6 hours and deploys straight to GitHub Pages (no
data commits).

## What it publishes

| Path | What |
|---|---|
| `/everett-events/` | Calendar UI — rolling month grid, agenda, venue/team filters, subscribe |
| `/everett-events/events.json` | JSON feed: `{ generated, events: [{venue,title,date,time,url}] }` — plus optional per-event `age21`, `soldOut`, `free` |
| `/everett-events/events.ics` | iCalendar feed — subscribable in Google/Apple/Outlook |
| `/everett-events/embed.js` | Drop-in widget for other sites |

Filtered feeds: `events-venue-<slug>.ics` per venue, `events-{21plus,day,soldout,free}.ics`
per badge, and `events-no-{silvertips,aquasox,wolfpack}.ics` team-exclusion feeds.

Embed on any site:

```html
<div id="everett-events"></div>
<script src="https://fosdal.net/everett-events/embed.js" data-max="8" defer></script>
```

Options via data-attributes: `data-max`, `data-venue`, `data-target`,
`data-nostyle`. Output uses `evt-ev-*` classes for restyling.

## Sources

- **Ticketmaster Discovery API** (city=Everett, WA) — Angel of the Winds
  Arena (Silvertips, Wolfpack, concerts), APEX Everett, Funko Field specials.
  Needs the `TICKETMASTER_API_KEY` repo secret.
- **MLB stats API** (sportId 13, teamId 403) — AquaSox home games at Funko
  Field. Public, no key.
- *TODO:* Port of Everett waterfront calendar (Revize CMS; its ICS export at
  `/revize/plugins/calendar/editpages/export_events.jsp?webspaceId=everett`
  currently 403s behind their CDN — revisit).

## Layout

- `scripts/fetch-events.mjs` — aggregates sources into `site/events.json` +
  the `.ics` feeds; self-archives by carrying past events forward from the
  published feed.
- `scripts/ics.mjs`, `merge.mjs`, `badges.mjs` — shared build logic, tested
  by `scripts/*.test.mjs` (`node --test scripts/*.test.mjs`).
- `site/` — static UI (no framework, no third-party services; QR codes via
  vendored MIT `qrcode.js`). Deployed as-is by the workflow.
- `.github/workflows/events.yml` — test → fetch → stamp asset versions →
  deploy to Pages, on a ~6h cron + push + manual dispatch.
