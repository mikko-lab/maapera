# Tietomaaperä

> Repo path stays `mikko-lab/maapera` (renaming is too expensive in broken-link terms). The product brand is **Tietomaaperä** (domain: `tietomaaperä.fi`).

InSAR-based ground motion monitoring for Finnish property managers. Surfaces European Ground Motion Service (EGMS) Sentinel-1 satellite data — millimetre-precision ground displacement from 2018 onwards — at the individual building level, translated into PTS-ready reports and continuous monitoring.

**Owner:** WP Saavutettavuus (Y-tunnus 3404806-1)  
**Status:** MVP. Turku and Helsinki live; Stripe + paywall deferred to month 2.

See [CLAUDE.md](CLAUDE.md) for the full product/tech overview and current decisions.

## What works today

- **ETL** (`etl/`) — EGMS Ortho-L3 tiles + MML Maastotietokanta → buildings classified by velocity anomaly against a per-city regional GIA baseline, with full timeseries rows preserved.
  - Turku: 3 tiles (E49N42 + E50N42), 22 651 buildings, 5.4 M timeseries rows
  - Helsinki: 1 tile (E51N42), 41 396 buildings, 11.4 M timeseries rows
- **Footprint attribution** — each EGMS point is classified KAT1 (inside footprint, elevated scatterer), KAT2 (inside but near edge or low), or KAT3 (outside, buffer zone). `attention`/`urgent` requires at least one KAT1 or KAT2 point. KAT3-only elevated velocity is labelled `regional_motion_flag` — a distinct signal, not a building risk. See [`docs/risk-classification-spec.md`](docs/risk-classification-spec.md).
- **Frontend** (`web/`) — MapLibre + deck.gl building map; city switcher (Turku / Helsinki); bbox-loaded FlatGeobuf, hyparquet timeseries on click, keyboard-accessible building panel. Buildings with `regional_motion_flag` render in steel-blue to distinguish area-wide signal from building-level risk.
- **PDF report** — 7-page Finnish report (`Tietomaaperäraportti`), generated client-side, WCAG-aware (shape + colour + text for risk class). Gated at ≥ 3 EGMS points.
- **Supabase** — schema deployed with RLS on every public table; `bootstrap` + `timeseries` edge functions enforce tier-based feature flags and history trimming server-side. Stripe-driven tier transitions are the deferred piece.

## Repo layout

```
etl/        Python ETL: EGMS + MML → buildings_<city>.fgb + timeseries_<city>.parquet
supabase/   SQL migrations + Edge Functions (auth, paywall, PDF, alerts)
web/        Vite + React + MapLibre + deck.gl frontend
docs/       Architecture decisions and classification specifications
content/    Finnish-language copy, brand, marketing
```

## Local dev

```bash
# ETL (uv) — run for a specific city
cd etl && uv sync
uv run python -m src.run_pipeline --city turku
uv run python -m src.run_pipeline --city helsinki

# Frontend (pnpm)
cd web && pnpm install && pnpm dev

# Supabase migrations
supabase db push --linked
```

The ETL writes `web/public/data/buildings_<city>.fgb` and `timeseries_<city>.parquet` into the frontend's public directory; both are gitignored and recreated by the pipeline (or fetched from R2 once the live deployment is up).

## Related projects in this portfolio

- **[qubit-harness](https://github.com/mikko-lab/qubit-harness)** — LangGraph-based agentic harness. Different domain, same engineering principle: a deterministic safety layer (Pydantic-validated bounds) wrapping non-deterministic decision-making (LLM proposals there, noisy InSAR interpretations here).
- **[a11y-lead-engine](https://github.com/mikko-lab/a11y-lead-engine)** — automated accessibility auditing. Shares the Pydantic-validated pipeline pattern and the "explicit failure modes over silent defaults" rule.

Each repo can be read standalone; clicking through any one of them should reveal the others as part of a coherent body of work.
