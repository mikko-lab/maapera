# CLAUDE.md

This file provides context for Claude Code when working on this repository.

## Project Overview

**Working title:** Tietomaaperä (formerly "Maaperä.fi"; see _Brand & domain_)
**Owner:** Mikko Tarkiainen / WP Saavutettavuus (Y-tunnus 3404806-1)
**Type:** SaaS web application
**Status:** MVP development, week 1

InSAR-based ground motion monitoring platform for Finnish property managers (isännöitsijät). The product surfaces European Ground Motion Service (EGMS) Sentinel-1 satellite data — millimeter-precision ground displacement measurements from 2018 onwards — at the individual building level. The product translates raw scientific data into actionable property-management decisions: PTS (Pitkän Tähtäimen Suunnitelma) reports, vajoamis-/subsidence alerts, and continuous building-level monitoring.

The technology pipeline (Sentinel-1 → InSAR → EGMS → building polygons) is the same used by Bentley Systems, Sixense, and NPA Satellite Mapping for billion-euro infrastructure projects. This product packages that capability for the property-management market segment, which has not previously had access at a practical price point.

## Brand & domain

- Brand: Tietomaaperä
- Domain (primary): tietomaaperä.fi
- Domain (typo redirect): tietomaapera.fi
- Defensive: maaperä.fi (if acquired)
- ASCII working name in code: "tietomaapera"
- Brand rationale: "tieto + maaperä" — datavetoinen näkemys maaperästä,
  erottuu konsultointi-positiosta ja yhdistää digital-first-näkökulman
  fyysiseen domain-asiantuntemukseen.

Rebranding history:

- 2026-05-25: Initial working name "Maaperä.fi"
- 2026-05-26: Rebrand to "Tietomaaperä" after discovery that maapera.fi
  was taken. Working name and brand chosen deliberately to differentiate
  from consulting incumbents.

## Target Customer

**Primary:** Mid-sized Finnish property management firms (5–30 employees, managing 100–500 housing companies). They have:
- Statutory due-diligence obligations (huolellisuusvelvoite)
- Existing PTS workflow into which our PDF report inserts naturally
- Authority to make ~€200–2000/mo software purchases without lengthy procurement

**Pricing positioning:** Premium (€49/mo Pro per user, €199/mo per office). We compete on credibility and integration with professional workflow — not price. Avoid "cheapest alternative" framing in all copy.

**Secondary segments (later):** Municipalities (Turku, Tampere, Helsinki technical departments), insurance companies, mining (Pyhäsalmi, Kittilä), infra owners (Väylävirasto, HSL).

## Tech Stack

### Backend / Data
- **Python 3.11+** for ETL (use **Polars**, not Pandas — EGMS files are 2–5 GB)
- **GeoPandas + Shapely** for spatial operations
- **DuckDB** for in-process analytics over Parquet
- **EGMS-toolkit** for raw data fetching from Copernicus
- **Pydantic** for ETL data validation and type safety at module boundaries
- **PostgreSQL 15 + PostGIS** via Supabase (managed)
- **Supabase Edge Functions** (Deno/TypeScript) for API endpoints
- **Cloudflare R2** for time-series Parquet files (no egress fees)
- **Supabase Storage** for FlatGeobuf vector tiles served to frontend

### Frontend
- **React 18 + Vite + TypeScript** (not Next.js — we want static deploy, minimal SSR complexity)
- **MapLibre GL JS** for base map (open, no Mapbox token)
- **deck.gl** for vector rendering (GeoJsonLayer for buildings, ScatterplotLayer for raw points)
- **Recharts** for time-series charts
- **Tailwind CSS** + shadcn/ui for components
- **Stripe Checkout** (hosted) for payments

### Infra
- **Vercel** for frontend hosting
- **Supabase** for auth + DB + edge functions
- **Cloudflare R2** for large static assets (FlatGeobuf, Parquet)
- **PostHog** for product analytics (self-host later if cost grows)

## Engineering principles shared with other projects

The same patterns appear in [mikko-lab/qubit-harness](https://github.com/mikko-lab/qubit-harness) and [mikko-lab/a11y-lead-engine](https://github.com/mikko-lab/a11y-lead-engine):

- **Pydantic models at module boundaries** — typed input/output contracts, vectorised constraint checks + sampled row instantiation in the ETL ([etl/src/models.py](etl/src/models.py))
- **Deterministic safety layer wrapping non-deterministic components** —
  in *maapera*: ETL thresholds (quality gate, plausibility cap, GIA baseline) wrap noisy InSAR signal;
  in *qubit-harness*: harness bounds wrap LLM proposals
- **Explicit failure modes** (`insufficient_data`, budget exhausted, validation error) over silent defaults; gaps stay visible to the user, never silently shrunk away

## Accessibility Requirement (Non-Negotiable)

The product owner is an accessibility consultant. **This application MUST meet WCAG 2.2 AA.** This is both an ethical requirement and a market differentiator (there is no fully accessible InSAR viewer on the market).

Concrete implications:
- Map interactions must have keyboard-only alternatives (building list view, search-by-address)
- All charts must have data-table fallbacks
- Color coding must always pair with a second visual cue (icon, pattern, label)
- Color contrast ≥ 4.5:1 for all text, ≥ 3:1 for UI components
- Screen-reader announcements for dynamic content (building selection, data loading)
- Use Skip Links, semantic HTML, ARIA only when semantic HTML is insufficient
- All forms have visible labels, error messages, success confirmation
- Focus indicators visible (3px outline minimum, do not remove)
- Reduce-motion media query respected for any animation

When in doubt, prioritize accessibility over visual flair. The accessibility story is part of the brand and the sales pitch.

## Data Architecture

### Critical separation: spatial data vs. time-series data

**DO NOT** store full time series in PostgreSQL or in the same file as building geometry. Time series is ~300+ observations per point × millions of points. Keep them separate.

```
buildings_turku.fgb           ← geometry + current state + risk class (FlatGeobuf)
                                served as static asset, bbox-loaded by frontend
                                
timeseries/turku/part-*.parquet  ← full displacement history per point_id
                                    served only via authenticated API endpoint
                                    paywalled by user tier
```

### ETL pipeline outputs

For each city/region, the ETL produces:

1. **`buildings_<city>.fgb`** — public, CDN-cached
   - `building_id` (from MML rakennus_p)
   - `geometry` (polygon, EPSG:3067)
   - `address` (from MML)
   - `mean_velocity_mm_y` (aggregated from contained InSAR points)
   - `max_velocity_mm_y`
   - `velocity_std`
   - `point_count` (number of EGMS points within polygon)
   - `risk_class` enum: `stable`, `monitor`, `attention`, `urgent`
   - `trend_class` enum: `stable`, `linear`, `accelerating`, `decelerating`, `seasonal`
   - `last_updated` (EGMS release date)

2. **`timeseries_<city>.parquet`** — gated, R2-hosted
   - `point_id`, `building_id`, `date`, `displacement_mm`
   - Partitioned by `building_id` first 2 chars for query efficiency

3. **PostgreSQL `buildings` table** — for filtering, aggregations, user dashboards
   - Same fields as .fgb but indexed for SQL queries
   - Used by "find all at-risk buildings in this municipality" queries

### Data classification thresholds

```python
# Risk class (based on max_velocity_mm_y, absolute value)
def risk_class(max_vel_abs: float) -> str:
    if max_vel_abs < 2.0: return "stable"        # within noise floor
    if max_vel_abs < 5.0: return "monitor"        # detectable but minor
    if max_vel_abs < 10.0: return "attention"     # warrants inspection
    return "urgent"                               # >10 mm/y, immediate concern

# Trend class (based on time-series regression)
# Use scipy.stats.linregress on full series, plus segmented analysis
# for last 24 months vs. earlier period to detect accelerating/decelerating
```

### Coordinate systems
- EGMS Ortho products: `easting/northing` in EPSG:3035 (ETRS89-LAEA) or UTM
- MML Maastotietokanta: EPSG:3067 (TM35FIN)
- Web frontend: EPSG:4326 (WGS84) for display
- **Spatial joins MUST happen in EPSG:3067** (meter-based, accurate distance)

### Quality filtering
Always filter EGMS points before aggregation:
- Remove points where `mean_velocity_std > 1.5 mm/y` (too noisy)
- Remove points where `coherence < 0.6` (unreliable phase measurement)
- Require minimum 3 points per building polygon for aggregation; else mark `insufficient_data`

## Database Schema (Supabase)

```sql
-- User tiers
CREATE TYPE user_tier AS ENUM ('public', 'registered', 'pro', 'enterprise');

-- Profiles extend Supabase auth.users
CREATE TABLE profiles (
    id UUID REFERENCES auth.users NOT NULL PRIMARY KEY,
    email TEXT,
    company_name TEXT,
    tier user_tier DEFAULT 'public' NOT NULL,
    max_tracked_properties INT DEFAULT 0,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    subscription_status TEXT DEFAULT 'none',  -- 'none','trialing','active','past_due','canceled'
    subscription_period_end TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Building registry (loaded from MML + EGMS aggregation)
CREATE TABLE buildings (
    building_id TEXT PRIMARY KEY,         -- MML rakennus_p ID
    city TEXT NOT NULL,
    municipality_code TEXT,                -- kuntakoodi
    address TEXT,
    postal_code TEXT,
    geom GEOMETRY(Polygon, 3067) NOT NULL,
    centroid GEOGRAPHY(Point, 4326) NOT NULL,  -- for fast distance queries
    mean_velocity_mm_y REAL,
    max_velocity_mm_y REAL,
    velocity_std REAL,
    point_count INT,
    risk_class TEXT,
    trend_class TEXT,
    last_egms_update DATE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_buildings_geom ON buildings USING GIST(geom);
CREATE INDEX idx_buildings_city ON buildings(city);
CREATE INDEX idx_buildings_risk ON buildings(risk_class) WHERE risk_class IN ('attention','urgent');

-- User-tracked properties (the "watch list")
CREATE TABLE tracked_properties (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users NOT NULL,
    building_id TEXT REFERENCES buildings(building_id) NOT NULL,
    nickname TEXT,                         -- e.g. "As Oy Mäntyrinne"
    alert_threshold_mm_y REAL DEFAULT 5.0,
    alerts_enabled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, building_id)
);

-- Alert log (for audit + email dedupe)
CREATE TABLE alerts_sent (
    id BIGSERIAL PRIMARY KEY,
    tracked_property_id BIGINT REFERENCES tracked_properties(id),
    triggered_at TIMESTAMPTZ DEFAULT NOW(),
    threshold_value REAL,
    actual_value REAL,
    email_sent BOOLEAN DEFAULT FALSE
);

-- PDF report generation log (rate limiting + analytics)
CREATE TABLE reports_generated (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users NOT NULL,
    building_id TEXT NOT NULL,
    generated_at TIMESTAMPTZ DEFAULT NOW(),
    pdf_url TEXT
);

-- Row Level Security — CRITICAL on EVERY public-schema table.
-- See "RLS discipline" below; an unenabled RLS lets the anon key
-- INSERT/UPDATE/DELETE through PostgREST, regardless of whether the
-- data is "sensitive" or not.
ALTER TABLE profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracked_properties  ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts_sent         ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports_generated   ENABLE ROW LEVEL SECURITY;
ALTER TABLE buildings           ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users see own profile" ON profiles
  FOR ALL USING (auth.uid() = id);
CREATE POLICY "users manage own tracked properties" ON tracked_properties
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users see own alerts" ON alerts_sent
  FOR SELECT USING (
    auth.uid() = (SELECT user_id FROM tracked_properties WHERE id = tracked_property_id)
  );
CREATE POLICY "users see own reports" ON reports_generated
  FOR SELECT USING (auth.uid() = user_id);

-- Buildings is reference data (world-readable), but RLS still on so
-- service_role is the only principal that can write. No INSERT/UPDATE/
-- DELETE policy ⇒ default deny ⇒ anon and authenticated can SELECT only.
CREATE POLICY "buildings_public_read" ON buildings
  FOR SELECT TO anon, authenticated USING (true);
```

### RLS discipline (added 2026-05-27 after Day-7 incident)

The `buildings` table shipped in the initial migration without RLS
because of a "data is non-sensitive, no RLS needed" comment. Supabase
Database Advisor flagged it as a write-vulnerability — anon could
DELETE every row via the public REST endpoint. Fix migration:
[`20260527183926_enable_buildings_rls.sql`](supabase/migrations/20260527183926_enable_buildings_rls.sql).

**Pattern for EVERY new table in the `public` schema:**

1. `CREATE TABLE …` — in a migration file.
2. `ALTER TABLE … ENABLE ROW LEVEL SECURITY;` — in the **same** file.
3. `CREATE POLICY …` — at least one, even if it's a flat `SELECT TO anon
   USING (true)` for reference data.
4. Verify after `supabase db push`:
   ```sql
   SELECT schemaname, tablename, rowsecurity
     FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
   ```
   Every row must show `rowsecurity = true`.

Do not assume "default deny" without RLS — without RLS the role's
table-level grants apply, and Supabase grants the `anon` role broad
DML on the `public` schema by default.

## Tier System & Paywall Logic

### Tier definitions

| Tier | Auth | Cities | Time series | PDF | Alerts | Tracked | Export |
|------|------|--------|-------------|-----|--------|---------|--------|
| `public` | none | Turku only (MVP) | last 12 mo | — | — | 0 | — |
| `registered` | email | all | last 36 mo | preview only | — | 1 | — |
| `pro` | email + Stripe | all | full 2018→ | ✓ | ✓ | 50 | CSV/GeoPackage |
| `enterprise` | email + Stripe | all | full 2018→ | ✓ branded | ✓ | unlimited | API |

### Bootstrap endpoint contract

`GET /api/bootstrap` — called once on app load. Returns feature flags.

```typescript
type BootstrapResponse = {
  authenticated: boolean;
  tier: 'public' | 'registered' | 'pro' | 'enterprise';
  user?: { id: string; email: string; company_name?: string };
  allowed_cities: string[] | ['all'];
  features: {
    full_timeseries: boolean;
    pdf_export: boolean;
    csv_export: boolean;
    alerts_enabled: boolean;
    multi_property_tracking: boolean;
    api_access: boolean;
  };
  limits: {
    max_tracked: number;
    max_reports_per_month: number;
  };
  paywall_copy: {
    upgrade_cta_text: string;
    upgrade_url: string;
  };
};
```

### Time-series endpoint contract

`GET /api/timeseries/:building_id` — gated by tier, trims data accordingly.

```typescript
type TimeseriesResponse = {
  status: 'success' | 'partial' | 'limited';
  tier: string;
  building_id: string;
  data: Array<{ date: string; displacement_mm: number }>;
  paywall_triggered?: boolean;       // true if data was trimmed
  upgrade_message?: string;          // shown when trimmed
  total_available_observations?: number;  // tease the locked content
};
```

**CRITICAL:** The trimming MUST happen server-side in the Edge Function. The full Parquet must never be sent to the browser for non-paying users. This is the paywall.

## File Structure

```
/
├── CLAUDE.md                         ← this file
├── README.md
├── .claudeignore                     ← excludes data/, *.csv, *.parquet, *.fgb
├── .env.example
│
├── etl/                              ← Python ETL pipeline
│   ├── pyproject.toml
│   ├── src/
│   │   ├── fetch_egms.py             ← uses EGMS-toolkit
│   │   ├── load_mml.py               ← loads Maastotietokanta rakennus_p
│   │   ├── spatial_join.py           ← EGMS points → building polygons
│   │   ├── classify.py               ← risk_class + trend_class logic
│   │   ├── export_fgb.py             ← writes buildings_<city>.fgb
│   │   ├── export_parquet.py         ← writes timeseries Parquet
│   │   └── upload.py                 ← uploads to R2 + Supabase
│   └── data/                         ← gitignored
│       ├── raw/                      ← downloaded EGMS tiles
│       ├── interim/                  ← MML extracts, cleaned points
│       └── processed/                ← final .fgb and .parquet outputs
│
├── supabase/
│   ├── migrations/                   ← SQL schema migrations
│   ├── functions/                    ← Edge Functions (Deno)
│   │   ├── bootstrap/
│   │   ├── timeseries/
│   │   ├── generate-pdf/
│   │   ├── stripe-webhook/
│   │   └── send-alerts/              ← cron-triggered
│   └── seed.sql
│
├── web/                              ← Vite + React frontend
│   ├── package.json
│   ├── index.html
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── lib/
│   │   │   ├── supabase.ts
│   │   │   ├── bootstrap.ts          ← fetches /api/bootstrap, caches
│   │   │   └── fgb-loader.ts         ← bbox-based FlatGeobuf loading
│   │   ├── components/
│   │   │   ├── Map/                  ← MapLibre + deck.gl wrapper
│   │   │   ├── BuildingPanel/        ← side panel on building click
│   │   │   ├── TimeseriesChart/      ← Recharts
│   │   │   ├── BuildingList/         ← keyboard-accessible alternative
│   │   │   ├── PaywallModal/
│   │   │   └── ui/                   ← shadcn/ui primitives
│   │   ├── routes/
│   │   │   ├── index.tsx             ← landing
│   │   │   ├── app.tsx               ← main map view
│   │   │   ├── dashboard.tsx         ← user's tracked properties
│   │   │   └── pricing.tsx
│   │   └── styles/
│   └── public/
│
└── content/                          ← copy, brand, marketing
    ├── landing.md
    ├── pricing.md
    ├── faq.md
    └── pdf-report-template.tsx       ← React-PDF or Puppeteer template
```

## Recent Decisions

- **2026-05-25:** Turku EGMS coverage requires TWO tiles (LAEA grid):
  - `E49N42_100km` (~22.5MB zip, ORTHO-UP, 2020-2024) — Western Turku
  - `E50N42_100km` (~21.0MB zip, ORTHO-UP, 2020-2024) — Eastern Turku
  - Filenames: `EGMS_L3_E{49|50}N42_100km_U_2020_2024_1.zip`
  - ETL must concatenate both before spatial filtering to Turku bbox.
  - Demo Point 30pJD7RiYA falls in E49N42 (verified: easting 4996650 < 5000000).

## Key Architecture Decisions (DO / DON'T)

**DO:**
- Use Polars over Pandas for EGMS CSV ingestion (10–50× faster, lower RAM)
- Use `gpd.points_from_xy()` instead of list comprehension with `Point()`
- Always project to EPSG:3067 for spatial joins, project back to 4326 for display
- Separate building geometry+state (.fgb) from time series (.parquet) at the architectural level
- Enable RLS on every table containing user data
- Add `stripe_customer_id`, `subscription_status` to profiles from day 1
- Cache bootstrap response client-side for the session
- Use HTTP Range Requests for FlatGeobuf (the entire point of choosing it)
- Lint with Biome (frontend) and Ruff (Python). Type-check with TypeScript strict + mypy
- Write tests for tier/paywall logic. Untested paywall = no paywall.

**DON'T:**
- Don't `pd.read_csv()` an EGMS tile directly — it will OOM
- Don't store time-series rows in PostgreSQL (3B rows for full Finland)
- Don't trim time series client-side. Trim in the Edge Function. Untrusted client = leak.
- Don't use Mapbox (paid token, vendor lock-in). MapLibre GL is the open fork.
- Don't use PointCloudLayer for 2D points. Use ScatterplotLayer.
- Don't put `latitude`/`longitude` Point geometries assuming WGS84 — EGMS Ortho uses projected coords.
- Don't ship without `velocity_std` quality filter — noisy points make the map look broken.
- Don't generate PDFs on the client. Edge Function + Puppeteer (or React-PDF) only.
- Don't skip a11y audit before launch. The brand depends on it.
- Don't expose service_role keys to the frontend. Ever.

## EGMS Data Specifics

- **Product to use:** Ortho L3 (Vertical component) — gives mm/y vertical displacement, more interpretable for laypeople
- **Tile system:** ETRS89-LAEA 100km grid (not UTM). Get tile IDs from EGMS Explorer.
- **Update cadence:** Annual (October/November release)
- **Coverage start:** 2018 onwards (Sentinel-1 stable acquisitions)
- **Resolution:** 100m grid for Ortho (resampled from native 20×5m)
- **Auth required:** Free Copernicus account
- **License:** Free for commercial use under Copernicus license. Attribution required.

### Required attribution on every page using EGMS data:
> Data: © European Union, Copernicus Land Monitoring Service, European Ground Motion Service (EGMS). Sentinel-1 © ESA.

## MML (Maanmittauslaitos) Data

- **Source:** Maastotietokanta, layer `rakennus_p` (building polygons)
- **Coverage:** All of Finland
- **License:** CC BY 4.0 (Open data, attribution required)
- **Format:** GeoPackage download by map sheet (karttalehti), e.g. `L41` for Turku
- **Update cadence:** Continuous (download monthly or quarterly)
- **CRS:** EPSG:3067 (TM35FIN)

### Required attribution:
> Rakennustiedot: © Maanmittauslaitos, Maastotietokanta. Lisenssi: CC BY 4.0.

## Brand & Copy Guidelines (Finnish)

The product communicates in **Finnish** to end users. Code, technical docs, commit messages in **English**.

### Tone
- Professional, expertise-led, NOT casual or "startup-cute"
- Targets sophisticated buyers who recognize names like Bentley, Sixense, ESA
- Avoid: "easy", "simple", "no-brainer", excessive emoji
- Prefer: precise, measured, technically credible
- Use "te"-muoto (formal you), not "sinä", in customer-facing copy

### Key value propositions (use these phrasings)
- "Sama satelliittiteknologia jolla seurataan Lontoon metroa — nyt suomalaisille isännöitsijöille"
- "Millimetrin tarkkuudella, vuodesta 2018 alkaen"
- "Huolellisuusvelvoitteesi täyttäminen kirjallisessa muodossa"
- "Ei pohjatutkimusta, ei kalustoa, ei käyntiä paikalla"

### Visual identity (initial direction)
- Color palette: Deep blue (data/technical), warning amber, danger red, success green
- Risk class colors: `stable` = #2D6A4F, `monitor` = #F1A208, `attention` = #DC4C25, `urgent` = #9B1B30
- All risk colors paired with icon AND text label (accessibility)
- Typography: Inter (UI) + IBM Plex Serif (long-form copy, PDF reports)

## Permissions for Claude Code

Add to `.claude/settings.json`:

```json
{
  "permissions": {
    "allow": [
      "Bash(npm:*)",
      "Bash(pnpm:*)",
      "Bash(python:*)",
      "Bash(uv:*)",
      "Bash(ruff:*)",
      "Bash(pytest:*)",
      "Bash(supabase:*)",
      "Bash(psql:*)",
      "Bash(git status)",
      "Bash(git diff:*)",
      "Bash(git log:*)",
      "Bash(git add:*)",
      "Bash(git commit:*)",
      "Bash(gh:*)"
    ],
    "deny": [
      "Bash(rm -rf:*)",
      "Bash(git push --force:*)",
      "Bash(git push -f:*)",
      "Bash(DROP TABLE:*)",
      "Bash(supabase db reset:*)"
    ]
  }
}
```

## MVP Scope (Week 1)

**Day 1:** ETL pipeline for Turku
- Fetch EGMS Ortho-Vertical tile covering Turku
- Load MML rakennus_p for Turku (karttalehti L41)
- Spatial join, classify, export `buildings_turku.fgb` + `timeseries_turku.parquet`
- Sanity-check in QGIS

**Day 2:** Supabase setup
- Run migrations
- Seed `buildings` table from FGB
- Deploy `bootstrap` and `timeseries` Edge Functions
- Test tier logic with mock users

**Day 3:** Frontend skeleton
- Vite + React + MapLibre + deck.gl
- Load FGB via bbox, render buildings colored by risk
- Click building → side panel with chart
- Auth UI (Supabase Auth UI library)

**Day 4:** Paywall + accessibility
- Wire bootstrap call, gate features client-side
- Keyboard-accessible building list view
- Screen reader announcements
- Color/contrast audit

**Day 5:** Landing + Stripe
- Static landing page (content from `content/landing.md`)
- Stripe Checkout integration
- Pricing page
- Free-tier signup flow

**Day 6:** PDF report
- React-PDF or Puppeteer template
- Edge Function endpoint, gated by `pro` tier
- Sample report end-to-end

**Day 7:** Polish + soft launch
- WCAG 2.2 AA audit (use existing a11y-lead-engine internally as dogfooding)
- LinkedIn post announcing MVP
- First demo booked

## Out of Scope (Don't Build in MVP)

- Multiple cities (Turku only at launch; add more after first paying customer)
- Mobile app (responsive web is enough)
- API for enterprise tier (build when first enterprise customer asks)
- Multi-user offices / team accounts (single user per subscription in MVP)
- Custom alert thresholds beyond simple mm/y (add complexity later)
- Integration with isännöinti-software (Domus, Tampuuri) — explore in month 2

## Open Questions / To Validate Before Building

1. EGMS Ortho-Vertical tile ID for Turku — get from EGMS Explorer manually
2. MML rakennus_p actual field names — verify on download
3. Stripe Tax handling for Finnish ALV (24%) — Stripe Tax may handle automatically
4. Y-tunnus on landing footer (domain decided — see _Brand & domain_)
5. Privacy policy + Terms of Service (required for Stripe activation)

## Known Issues (carry to Day 7+)

These are working but documented workarounds; revisit when custom TTF
fonts and a server-side PDF renderer come online.

- **U+2212 Unicode minus drops out of PDF.** react-pdf's built-in
  Helvetica uses Adobe Type 1 with WinAnsiEncoding, which lacks
  `−` (U+2212), `≥` (U+2265), `≤` (U+2264), `▲` (U+25B2), `●` (U+25CF).
  Workarounds in place: ASCII `-` everywhere ([format.ts](web/src/pdf/lib/format.ts), [ChartImage.tsx](web/src/pdf/components/ChartImage.tsx));
  "yli 12 mm/v" instead of "≥12 mm/v" ([RiskThermometer.tsx](web/src/pdf/components/RiskThermometer.tsx));
  badge icons drawn as SVG shapes ([RiskBadge.tsx](web/src/pdf/components/RiskBadge.tsx)).
  **Fix when**: registering Inter or IBM Plex via `Font.register()` on a bundled
  TTF — they cover all the above code points.

- **react-pdf 4.5 drops render-prop Text when wrapped in a fixed View.**
  A `<View fixed>` containing a `<Text render={...}>` silently produces no
  output across the whole document, even though the static siblings render
  fine. Workaround: Footer returns an *array* of top-level fixed Text
  siblings rather than a wrapping View ([Footer.tsx](web/src/pdf/components/Footer.tsx)).
  Page-level `lineHeight` style also reproduces the bug. **Fix when**:
  upgrading past react-pdf 4.5 — re-test and collapse back to the View
  pattern if resolved.

- **Hyphenation disabled globally.** Finnish compound words were being broken
  mid-stem (e.g. "routa- tai pohjavesivaikutus" → "routa- // tai..."), so
  `Font.registerHyphenationCallback((word) => [word])` is set in
  [PDFReport.tsx](web/src/pdf/PDFReport.tsx). **Fix when**: shipping a
  Finnish-aware hyphenation dictionary.

## Related Repos (Owner's Other Projects)

- `mikko-lab/a11y-lead-engine` — accessibility audit automation, can be used to test this product
- `mikko-lab/geo-agent` — WordPress plugin for AI-search SEO; potentially relevant for landing page schema markup

---

*Last updated: 2026-05-25. Keep this file under 500 lines. When in doubt, link out to ADRs in `docs/decisions/`.*

*TODO: When CLAUDE.md exceeds ~500 lines (currently 538), split into docs/decisions/ ADRs and docs/architecture/ — keep CLAUDE.md as a thin index.*
