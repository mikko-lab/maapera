# Tietomaaperä

> Repo path stays `mikko-lab/maapera` (renaming is too expensive in broken-link terms). The product brand is **Tietomaaperä** (domain: `tietomaaperä.fi`).

InSAR-based ground motion monitoring for Finnish property managers. Surfaces European Ground Motion Service (EGMS) Sentinel-1 satellite data — millimetre-precision ground displacement from 2018 onwards — at the individual building level, translated into PTS-ready reports and continuous monitoring.

**Status:** MVP, week 1. Owner: WP Saavutettavuus (Y-tunnus 3404806-1).

See [CLAUDE.md](CLAUDE.md) for the full product/tech overview and current decisions.

## Repo layout

```
etl/        Python ETL: EGMS + MML → buildings_<city>.fgb + timeseries_<city>.parquet
supabase/   SQL migrations + Edge Functions (auth, paywall, PDF, alerts)
web/        Vite + React + MapLibre + deck.gl frontend
content/    Finnish-language copy, brand, marketing
```

## Related projects in this portfolio

- **[qubit-harness](https://github.com/mikko-lab/qubit-harness)** — LangGraph-based agentic harness. Different domain, same engineering principle: a deterministic safety layer (Pydantic-validated bounds) wrapping non-deterministic decision-making (LLM proposals there, noisy InSAR interpretations here).
- **[a11y-lead-engine](https://github.com/mikko-lab/a11y-lead-engine)** — automated accessibility auditing. Shares the Pydantic-validated pipeline pattern and the "explicit failure modes over silent defaults" rule.

Each repo can be read standalone; clicking through any one of them should reveal the others as part of a coherent body of work.
