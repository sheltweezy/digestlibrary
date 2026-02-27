# Digest Library — Architecture & Design Plan

## What This Is

Digest Library is the **Consumption Library** — one of three domain-specific libraries in a Personal Intelligence System. It tracks everything a person ingests over time: food, drinks, caffeine, supplements, and prescriptions. The primary data source is SnapCalorie, a food logging app that exports weekly CSVs via email.

The value compounds over time. At 1 month it's a log. At 6 months it's a pattern. At 2 years it's a longitudinal dataset that surfaces behavioral trends no single week of data could reveal.

This library is designed to eventually feed into a Letta (MemGPT) agent that reasons across all three libraries simultaneously — connecting what you eat to your health outcomes and life context.

---

## The Bigger Picture

| Library | Domain | Status |
|---|---|---|
| Consumption Library (this) | Food, drinks, caffeine, supplements | In progress |
| Health Library | Lab results, biometrics, symptoms | Planned |
| Media Library | Photos, videos, semantic descriptions | Planned |
| Letta Agent | Cross-library reasoning + proactive discovery | Planned |

The agent layer is what transforms three databases into a system that thinks. It answers questions you ask, and proactively discovers correlations you never thought to ask about — e.g., "your energy self-reports are lower on days following 400mg+ caffeine, and this pattern has appeared 14 times in the last 6 months."

---

## Hardware Stack

**Primary: Corsair AI Workstation 300** — runs 24/7 as a home server

| Component | Spec |
|---|---|
| CPU | AMD Ryzen AI MAX+ 395 (16-core Zen 5) |
| GPU / NPU | AMD Radeon 8060S iGPU (integrated, shares system RAM) |
| Memory | 96 GB LPDDR5X unified memory (~256 GB/s bandwidth) |
| Storage | 1 TB M.2 NVMe SSD |
| Network | 2.5G Ethernet + Wi-Fi 6E |
| OS | Windows 11 Pro |

The key architectural advantage is **unified memory** — the GPU shares the full 96GB with the CPU. A 32B parameter vision model that would require a $5,000+ discrete GPU runs entirely within this machine's memory budget, alongside all other services.

**Development machine:** Personal PC — code is written here with Claude Code, pushed to GitHub, pulled to the workstation for deployment.

---

## Software Stack

| Layer | Technology | Purpose |
|---|---|---|
| API | FastAPI + Uvicorn | REST backend, port 8003 |
| ORM | SQLAlchemy 2.0 | Database models and queries |
| Structured DB | SQLite | Macros, timestamps, nutritional data |
| Vector DB | ChromaDB | Meal context, notes (planned) |
| Frontend | Vanilla JS + Alpine.js | Reactive UI, no build step |
| Charts | Chart.js | Line, bar, doughnut charts |
| Icons | Phosphor Icons | Inline SVG icon set |
| Inference | Ollama → Qwen3 (planned) | Future LLM integration |
| Agent | Letta / MemGPT (planned) | Cross-library reasoning |
| Deployment | Docker + Docker Compose | Single-command deployment |

**Design principle:** No npm, no build pipeline. The frontend is vanilla JS served as static files directly from FastAPI. All vendor libraries (Alpine.js, Chart.js, Phosphor) are downloaded locally — no CDN dependency, fully offline.

---

## Data Architecture

### SQLite — Structured Facts
Everything with a schema lives here: macros, timestamps, serving sizes, nutritional values. Fast queries, precomputed daily rollups via `DailySummary`.

### ChromaDB — Unstructured Context (planned)
Meal notes, observations, context. Why you ate what you ate. Semantic search via vector embeddings.

### Letta Archival Memory — Emergent Intelligence (planned)
Synthesized patterns and behavioral insights the agent has discovered across sessions. Not raw data — the narrative layer.

---

## Data Models

### `Profile`
One record per person. Supports multiple household members.

| Field | Type | Notes |
|---|---|---|
| id | Integer | Primary key |
| name | String | Display name |
| date_of_birth | Date | Age computed at query time |
| weight_lbs | Float | Static, updated manually |
| height_inches | Float | Stored as total inches (e.g. 71.0 = 5'11") |
| biological_sex | String | "male" / "female" / "other" |
| photo_path | String | Relative URL to uploaded photo |
| created_at | DateTime | |

### `ConsumptionEntry`
One row per logged food/drink item.

| Field | Type | Notes |
|---|---|---|
| id | Integer | |
| profile_id | FK → Profile | |
| logged_at | DateTime | Exact timestamp |
| log_date | Date | Derived from logged_at, for day-level queries |
| meal_context | String | Inferred from time: breakfast / lunch / dinner / late_night / other |
| item_name | String | Food name from SnapCalorie |
| brand | String | Optional |
| category | String | food / drink / supplement / prescription |
| calories | Float | kcal |
| protein_g | Float | |
| carbs_g | Float | |
| fat_g | Float | |
| saturates_g | Float | Saturated fat |
| fiber_g | Float | |
| sugar_g | Float | |
| cholesterol_mg | Float | |
| sodium_mg | Float | |
| potassium_mg | Float | |
| water_ml | Float | Not in SnapCalorie export — manual entry |
| caffeine_mg | Float | Not in SnapCalorie export — manual entry |
| serving_qty | Float | Quantity (e.g. 10) |
| serving_size | String | Unit (e.g. "oz", "tbsp") |
| source | String | "snapcalorie" / "manual" |
| notes | Text | For future ChromaDB context |

All nutritional fields are nullable — not every item has every value.

### `DailySummary`
Precomputed daily rollup per profile. Rebuilt on every ingestion for affected dates.

Stores totals for all nutritional fields + `entry_count` and `updated_at`.

### `ProfileGoals`
One record per profile (upsert). Daily macro targets set manually.

Fields: `calories`, `protein_g`, `carbs_g`, `fat_g`, `fiber_g`, `water_ml`, `caffeine_mg`

---

## Data Ingestion

**Source:** SnapCalorie exports weekly CSVs, emailed to the user. Imported via file upload in the web UI.

**Real CSV format:**
```
Date,Time,Food,Quantity,Unit,Calories (kcal),Protein (g),Carbs (g),Fat (g),Saturates (g),Fiber (g),Sugar (g),Cholesterol (mg),Sodium (mg),Potassium (mg)
2026-02-05,20:17,steak,10,oz,652.03,76.54,0,36.85,15.05,0,0,235.3,1040.41,910
```

Key traits:
- `Date` and `Time` are separate columns
- Column headers include units in parentheses
- Blank cells (not zero) for missing optional fields
- No meal label — meal context is inferred from timestamp
- No caffeine or water columns

**Meal inference rules:**
- 5:00–9:59am → Breakfast
- 10:00am–2:59pm → Lunch
- 3:00–8:59pm → Dinner
- 9:00–11:59pm → Late Night
- 12:00–4:59am → Other

**Ingestion behavior:** No deduplication — importing the same file twice doubles the entry count. This is a known limitation. Importing 7-day exports weekly is the intended workflow.

---

## API

FastAPI app running on port 8003. All routes prefixed with `/consumption`.

### Profile routes
```
GET    /consumption/profiles                          — list all
POST   /consumption/profiles                         — create
GET    /consumption/profiles/{id}                    — get single with demographics
PUT    /consumption/profiles/{id}                    — update demographics
DELETE /consumption/profiles/{id}                    — cascade delete all data
POST   /consumption/profiles/{id}/photo              — upload profile photo
GET    /consumption/profiles/{id}/goals              — get macro goals
POST   /consumption/profiles/{id}/goals              — upsert macro goals
```

### Ingestion routes
```
POST   /consumption/profiles/{id}/ingest/snapcalorie — upload CSV
```

### Data routes
```
GET    /consumption/profiles/{id}/summary/{date}     — single day summary
GET    /consumption/profiles/{id}/summaries          — date range summaries
GET    /consumption/profiles/{id}/entries            — entries (filterable by date, category)
```

### Analytics routes
```
GET    /consumption/profiles/{id}/dashboard          — overview data (30-day)
GET    /consumption/profiles/{id}/trends             — trend series for charting
GET    /consumption/profiles/{id}/favorites          — most frequent foods
GET    /consumption/profiles/{id}/meal-patterns      — per-meal-context breakdown
GET    /consumption/profiles/{id}/recent             — most recent N entries
```

---

## Web UI

### Pages (nav order)

**Trends** — default home page, opens on `1M` filter
- Date range filter: `7D` | `1M` | `3M` | `1Y` | `All` | `Custom`
- Metric toggles: Calories, Protein, Carbs, Fat, Fiber, Sodium, Sugar
- Full-width multi-series line chart
- Rolling averages for the selected period (avg per day)
- Favorite foods table: Food, Times Logged, Avg Calories, Avg Protein
- Meal pattern breakdown by time of day

**Overview** — "state of you" 30-day summary
- 30-day averages vs. goals with trend direction vs. prior period
- Logging streak (consecutive days with data)
- Days logged out of period total
- Most logged food, highest sodium day, lowest calorie day
- Period switchable: 7D / 30D / 3M

**History** — calendar + day drill-down
- Month calendar grid, each cell shows daily calorie total
- Click a day → entry list grouped by meal context
- Prev/next month navigation

**Profiles** — profile management
- Card grid — each card shows photo/avatar, name, age, sex, height, weight, BMI
- Create, edit, delete (with confirmation modal)
- Goals form per profile: daily targets for all 7 metrics

**Upload** — CSV import
- Profile selector
- Drag-and-drop CSV zone
- Result: inserted count, skipped count, expandable error list

### Routing
Hash-based SPA (`#trends`, `#overview`, `#history`, `#profiles`, `#upload`). Page HTML fragments loaded into `<div id="page-content">` on navigation. Active profile persisted in `localStorage`.

---

## Design System

Mirrors Covington.Ventures — consistent visual identity across the personal intelligence suite.

### Colors
```css
--bg-base:          #0F1117;   /* page background */
--bg-surface:       #1A1D27;   /* cards, panels */
--bg-elevated:      #22263A;   /* hover states */
--border:           #2E3248;

--accent-gold:      #C9A84C;   /* primary accent */
--accent-gold-muted:#8A6F30;
--accent-gold-bg:   rgba(201, 168, 76, 0.08);

--text-primary:     #F0F0F5;
--text-secondary:   #8B8FA8;
--text-muted:       #5A5E78;

--status-green:     #3ECF8E;   /* goals met, positive trends */
--status-amber:     #F5A623;   /* approaching limit (90%+) */
--status-red:       #F25B5B;   /* over limit */
--status-blue:      #4D9FEC;   /* informational */
```

### Typography
- **Inter** — all UI text, labels, navigation
- **JetBrains Mono** — all numeric values (calories, macros, weights, BMI)

### Icons
**Phosphor Icons** — inline SVG, no npm required. Key assignments:

| Metric | Icon | Page / Action | Icon |
|---|---|---|---|
| Calories | `flame` | Trends | `chart-line` |
| Protein | `egg` | Overview | `squares-four` |
| Carbs | `bread` | History | `calendar-blank` |
| Fat | `drop-half` | Profiles | `users` |
| Fiber | `leaf` | Upload | `upload-simple` |
| Sodium | `test-tube` | Edit | `pencil-simple` |
| Sugar | `candy` | Delete | `trash` |
| Water | `drop` | Goal met | `check-circle` |
| Caffeine | `coffee` | Warning | `warning` |
| Cholesterol | `heart-pulse` | Over limit | `x-circle` |
| Potassium | `lightning` | Streak | `fire` |

### Component rules
- Cards: `--bg-surface`, `1px solid var(--border)`, `8px` radius
- Inputs: `--bg-base` background, `4px` radius, gold border on focus
- Progress bars: gold fill; amber at 90% of goal; red if over (inverted for sodium/sugar)
- Nav active: 3px gold left border + `--accent-gold-bg` background
- Transitions: `cubic-bezier(0.4, 0, 0.2, 1)`, 0.15s hover, 0.25s panels

---

## Deployment

Docker Compose — single command on the Corsair workstation.

```
docker compose up -d
```

- App available at `http://<workstation-ip>:8003` from any device on the local network
- SQLite DB persisted in a named Docker volume
- Local DNS: add `127.0.0.1 consumption.home` to workstation hosts file for `consumption.home:8003`
- `digest_net` Docker network shared with future services (Ollama, Letta, ChromaDB)

---

## File Structure

```
Digest Library/
├── PLAN.md                          ← this file
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
├── .env.example
├── .gitignore
├── src/
│   ├── models/
│   │   └── consumption.py           ← Profile, ConsumptionEntry, DailySummary, ProfileGoals
│   ├── db/
│   │   └── database.py              ← SQLite engine, session, init_db()
│   ├── ingestion/
│   │   └── snapcalorie.py           ← CSV parser → SQLite
│   ├── analytics/
│   │   └── queries.py               ← trend data, favorites, meal patterns, overview
│   ├── api/
│   │   ├── main.py                  ← FastAPI app, static file mount
│   │   ├── schemas.py               ← Pydantic request/response models
│   │   └── routes/
│   │       ├── consumption.py       ← profiles, ingestion, summaries, entries
│   │       └── analytics.py         ← trends, favorites, meal patterns, overview
│   └── static/
│       ├── index.html               ← app shell
│       ├── vendor/
│       │   ├── alpine.min.js
│       │   ├── chart.umd.min.js
│       │   └── phosphor.js
│       ├── css/
│       │   ├── app.css
│       │   ├── dashboard.css
│       │   └── charts.css
│       ├── js/
│       │   ├── api.js
│       │   ├── app.js
│       │   ├── trends.js
│       │   ├── overview.js
│       │   ├── history.js
│       │   ├── profiles.js
│       │   └── upload.js
│       ├── pages/
│       │   ├── trends.html
│       │   ├── overview.html
│       │   ├── history.html
│       │   ├── profiles.html
│       │   └── upload.html
│       └── uploads/
│           └── profiles/            ← profile photos (gitignored)
├── data/                            ← SQLite + ChromaDB (gitignored)
└── tests/
    ├── test_ingestion.py
    └── fixtures/
        └── sample_snapcalorie.csv   ← real CSV format
```

---

## Build Order

1. Fix models (schema is the foundation everything else depends on)
2. Rewrite ingestion pipeline (real column names, split Date+Time, meal inference)
3. Fix test fixture + tests
4. Add ProfileGoals CRUD routes
5. Build analytics query layer
6. Wire up analytics API routes
7. Update `main.py` (static mount, new routers)
8. Build frontend (index shell → pages → JS logic)
9. Dockerfile + docker-compose.yml
