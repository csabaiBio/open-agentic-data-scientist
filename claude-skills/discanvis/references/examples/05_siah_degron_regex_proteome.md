# Example 05 — Proteome-wide SIAH degron regex

## Question

Which human proteins contain the `.[PAV]P[^P]` SIAH degron motif pattern?

## Answer

A **proteome-wide regex scan** returns many proteins with at least one match. Filter by **disorder fraction** of the motif span and optional **mutation enrichment** (TCGA/ClinVar counts in batch columns) to prioritize candidates.

## Portal page

**Batch Analysis** (prediction mode, regex + disorder cutoff).

## Tools (in order)

### 1. `batch_analyze`

Provide a protein list (`roi`) — full human proteome accessions from Downloads, a GO set, or drivers — then:

```json
POST /api/v1/batch/analyze/
{
  "roi": "<newline-separated accessions or gene symbols>",
  "search_type": "gencode",
  "search_mode": "full",
  "discovery_method": "prediction",
  "motif_mode": "regex",
  "regex_input": ".[PAV]P[^P]",
  "enforce_disorder_cutoff": true,
  "disorder_min_percent": 60,
  "columns": [
    "identifier", "gene", "start", "end",
    "disorder_combined", "tcgam", "clinvar", "pem", "am"
  ]
}
```

### 2. Optional: `get_position` on top hits

For reporting known pathogenic variants overlapping the motif.

## Supplementary notes

- Regex follows **ELM Siah degron** class notation; validate matches against **PEM** curated predictions where available.
- Large `roi` lists: run in chunks or use precomputed browse filters first.
- **References:** [../../pages/biological/batch_analysis.md](../../pages/biological/batch_analysis.md); [../../README_CAPABILITIES.md](../../README_CAPABILITIES.md) §3.2.
