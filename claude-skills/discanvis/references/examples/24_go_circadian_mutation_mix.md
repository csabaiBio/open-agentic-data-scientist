# Example 24 — GO circadian rhythm gene set

## Question

Show me the genes associated with a specific Gene Ontology (GO) term (e.g., circadian rhythm) and let's view their mutations.

## Answer

Resolve **GO:xxxx** to main-isoform proteins, then run **batch** (or browse) to show **disorder fraction** and whether **somatic/clinical** mutations fall predominantly in **IDRs vs structured** domains per protein.

## Portal page

**Browse Tables** / **Batch Analysis**; open **Summary** for individual genes.

## Tools (in order)

### 1. `get_go_proteins`

```http
GET /ajax/go-genes/?id=GO:0032924
```

(Example: circadian rhythm — replace with user-supplied GO ID.)

### 2. `batch_analyze`

```json
POST /api/v1/batch/analyze/
{
  "roi": "<accessions joined by newline>",
  "search_type": "gencode",
  "search_mode": "full",
  "columns": [
    "identifier", "gene", "disorder_combined",
    "tcgam", "clinvar", "tcgaf", "cosmicm"
  ],
  "include_cohort_statistics": true
}
```

## Supplementary notes

- GO cache uses **main isoform** rule aligned with Statistics dynamic GO ([../TOOLS.md](../TOOLS.md) §6).
- User may mean **GO:0007623** (rhythmic process) — always confirm GO ID.
- **References:** [../../pages/biological/statistics.md](../../pages/biological/statistics.md); [../DATABASE_SCHEMA.md](../DATABASE_SCHEMA.md) (GO_Term).
