# Tarter Gate (TGC) Production Dashboard

Live production screens for the Gate plant, built from the weekly production workbooks
each work cell fills in during the shift.

- **All cells** (`/tv`): one tile per work cell with % to goal, UPLH vs. goal, pieces vs.
  schedule, operators, downtime, and parts made without an Epicor standard.
- **One cell** (`/tv/<cell>`, e.g. `/tv/TK1`): the cell's parts this shift with forecast,
  actual, standard and crew, plus its last shifts.
- **Preview** (`/preview`, `/preview/AWL1`): sample data, nothing read or published.

## How it works

```
SharePoint "Production Reporting" folder (synced with OneDrive on the source PC)
  ├─ <Cell> Weekly Production.xlsx   one per work cell, one tab per week ("11-9-26")
  └─ Production Standards.xlsx       Epicor export (part, resource group, site, crew, std)
        │  read every 10 s by the source PC's browser (Chrome/Edge, "Connect Folder")
        ▼
  POST /api/publish  ──►  Supabase table gate_snapshot (one row)
                                │
  every TV:  GET /api/feed-snapshot every 15 s, computes the numbers for the current minute
```

- Only the source PC reads files. TVs just open a link; no login, no folder.
- The source PC publishes the raw week (parts, forecast, actual, operators, hours,
  downtime, and the standard/crew looked up from the export). Each screen computes % to
  goal itself, so the pace keeps moving between saves.
- Standards are looked up by **part + resource group (cell B1) + site (cell E1)**. Epicor
  repeats operations for alternate routings: the main routing wins, an alternate is used
  only when the part has nothing else in that resource group, copies are never added up.

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
| `js/config.js` | Plant settings: cells and areas, site, time zone, shifts, color bands, workbook layout |
| `js/reader.js` | Reads the workbooks and the standards export (SheetJS) |
| `js/metrics.js` | Shift clock and every number on the screens |
| `js/render.js` | The two screens (HTML) |
| `js/app.js` | Source PC folder reading + publishing; TV polling |
| `js/sample.js` | Preview data |
| `api/publish.js`, `api/feed-snapshot.js`, `lib/` | Vercel functions and Supabase access |
| `tests/` | `npm test` (Node 20+, Playwright for the end-to-end test) |

Another plant = a copy with its own `js/config.js` (cells, site, shifts), its own
Supabase row/project and Vercel project.

## Setup

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

`https://<project>.vercel.app/tv` (all cells) or `/tv/TK1` (one cell). The page scales
to any screen; `?scale=0.9` forces a size.

## Notes for IT

- Data on the TVs comes only from `/api/feed-snapshot`; the Supabase key never reaches the
  browser. Text from the workbooks is escaped before it's shown; the API stores only the
  fields the screens use (`lib/clean.js`).
- To keep the links private, turn on Vercel Deployment Protection (or put the TVs behind
  the company network) and set `PUBLISH_KEY`.
- Moving to Tarter's platform: the reading and math (`js/reader.js`, `js/metrics.js`) are
  plain functions with tests; the transport (folder → Supabase → TVs) is the part to
  replace, e.g. reading the files with Microsoft Graph from a server instead of a PC.
