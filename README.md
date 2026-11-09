# Tarter Gate (TGC) Production Dashboard

Live production screens for the Gate plant, built from the weekly production workbooks
each work cell fills in during the shift. Same look as the West dashboard.

- **All cells**: one card per work cell with % to goal, UPLH vs. goal, schedule done,
  actual vs. scheduled pieces, operators, downtime, and parts made without an Epicor standard.
- **One cell** (`?cell=TK1`): the cell's parts this shift with forecast, actual, standard
  and crew, plus its last shifts.
- **Preview** (`?preview=1`, `?preview=1&cell=AWL1`): sample data, nothing read or published.

## Two ways to run it (same code)

### Tarter Portal (where it's meant to live)

The portal serves this repo (`index.html`, `js/`, `vendor/`) with a `_feed/` folder next to
the page that it fills from SharePoint. The page finds `_feed/manifest.json` and switches to
portal mode by itself: no source PC, no Supabase, no Vercel.

```
SharePoint "Production Reporting" folder
  ├─ <Cell> Weekly Production.xlsx   one per work cell, one tab per week ("11-9-26")
  └─ Production Standards.xlsx       Epicor export (part, resource group, site, crew, std)
        │  read by the Tarter Portal
        ▼
  _feed/manifest.json + each workbook as JSON
        │  snapshot.json: the portal runs js/config.js, reader.js, portal.js, snapshot.js
        │  and calls buildGateSnapshot(manifest, previous) -> _feed/snapshot.json (a few KB)
        ▼
  every TV: reads the manifest every 30 s, then the snapshot when it changes
```

- If the portal doesn't build the snapshot, the page reads the workbooks from the feed
  itself (same reader), only downloading the ones that changed.
- While the portal reports it can't read SharePoint, the screens keep the last numbers
  with a red banner. A workbook that can't be read for a moment keeps its last good read.
- The status line in the portal's TV bar comes from the page (`postMessage({ tvUpdated })`).
- One dashboard in the portal is enough: TVs that show one cell use `?cell=TK1` (or `#cell=TK1`).

### Vercel (testing)

```
OneDrive-synced folder on the source PC
        │  read every 10 s by the source PC's browser (Chrome/Edge, "Connect Folder")
        ▼
  POST /api/publish  ──►  Supabase table gate_snapshot (one row)
                                │
  every TV (?tv=1): GET /api/feed-snapshot every 15 s
```

- Only the source PC reads files. TVs just open a link; no login, no folder.
- The source PC publishes the raw week (parts, forecast, actual, operators, hours,
  downtime, and the standard/crew looked up from the export). Each screen computes % to
  goal itself, so the pace keeps moving between saves.

Either way, standards are looked up by **part + resource group (cell B1) + site (cell E1)**.
Epicor repeats operations for alternate routings: the main routing wins, an alternate is
used only when the part has nothing else in that resource group, copies are never added up.

### The numbers

| Number | Formula |
|---|---|
| % TO GOAL | Σ (actual × crew ÷ std) ÷ (operators × shift hours × part of the shift worked) |
| UPLH | pieces made ÷ (operators × hours worked) |
| UPLH goal | Σ forecast ÷ Σ (forecast × crew ÷ std), scheduled parts with a standard |
| Schedule | scheduled pieces made ÷ forecast (expected by now = part of the shift worked) |
| Colors | 80%+ on pace, 60–79% behind, under 60% off pace (`js/config.js`) |

A part made with no standard for that cell's resource group shows in red and isn't
counted; it's the flag for the plant to add the standard in Epicor.

### Shifts (plant time, America/New_York)

1st 6:00–16:30 · 2nd 16:30–2:00 (belongs to the day it started) · Weekend 4:00–16:30.
Between shifts the screens show the last shift that ran. All in `js/config.js`.

## Files

| Path | What it is |
|---|---|
| `index.html` | The page and its styles (inline, so the portal needs only `index.html`, `js/`, `vendor/`) |
| `js/config.js` | Plant settings: cells and areas, site, time zone, shifts, color bands, workbook layout |
| `js/reader.js` | Reads the workbooks and the standards export; `collect()` turns a folder or feed into the screens' data |
| `js/metrics.js` | Shift clock and every number on the screens |
| `js/render.js` | The two screens (HTML) |
| `js/portal.js`, `js/snapshot.js`, `snapshot.json` | Tarter Portal feed and the summary the portal builds |
| `js/app.js` | Picks the mode (portal, Vercel TV, source PC, preview) and runs it |
| `js/sample.js` | Preview data |
| `api/`, `lib/` | Vercel functions and Supabase access (not used in the portal) |
| `tests/` | `npm test` (Node 20+, Playwright for the end-to-end tests) |

The `js/` files are plain scripts sharing one global object (`Gate`), loaded in order: no
bundler, and the same files run in the browser, in the portal's snapshot engine and in Node.

Another plant = a copy with its own `js/config.js` (cells, site, shifts).

## Setup on Vercel (testing only; the portal needs none of this)

### 1. Supabase (one table)

```sql
create table public.gate_snapshot (
  id int primary key,
  data jsonb not null,
  source_label text,
  changed_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.gate_snapshot enable row level security;
-- no policies: only the service_role key (server side) can read or write
```

### 2. Vercel project

Import this repo. Environment variables:

| Variable | Value |
|---|---|
| `SUPABASE_URL` | `https://<project>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | the secret key (`sb_secret_...`) |
| `PUBLISH_KEY` | optional; if set, the source PC asks for it once |

### 3. Source PC

1. In OneDrive, add the SharePoint **Production Reporting** folder (with the 13 workbooks
   and `Production Standards.xlsx`) and mark it "Always keep on this device".
2. Open the site root in Chrome or Edge, click **CONNECT FOLDER**, pick that folder,
   allow access. After a restart: **RECONNECT FOLDER**.
3. Leave the tab open. The status bar shows what was read and "TVs updated hh:mm".

### 4. TVs

`https://<project>.vercel.app/?tv=1` (all cells) or `/?tv=1&cell=TK1` (one cell); the old
`/tv` and `/tv/TK1` links redirect there. The page scales to any screen; `?scale=0.9`
forces a size.

## Notes for IT

- Data on the TVs comes only from `/api/feed-snapshot`; the Supabase key never reaches the
  browser. Text from the workbooks is escaped before it's shown; the API stores only the
  fields the screens use (`lib/clean.js`).
- To keep the links private, turn on Vercel Deployment Protection (or put the TVs behind
  the company network) and set `PUBLISH_KEY`.
- In the Tarter Portal none of the Vercel parts are used (`api/`, `lib/`, Supabase, the
  source PC): the portal reads SharePoint and the page reads the portal's `_feed/`.
