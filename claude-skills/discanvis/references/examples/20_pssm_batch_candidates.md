# Example 20 — PSSM search across candidate list

## Question

Can I search for a specific PSSM (Position-Specific Scoring Matrix) binding motif within a list of 50 candidate proteins?

## Answer

**Yes.** **Batch Analysis** accepts a newline-separated protein list plus **PSSM** matrix (**JSON** or **TSV**) and returns scored hits per protein with **disorder statistics** and optional pathogenicity columns.

## Portal page

**Batch Analysis** (prediction → PSSM).

## Tools (in order)

### 1. `batch_analyze`

```json
POST /api/v1/batch/analyze/
{
  "roi": "GENE1\nGENE2\n...",
  "search_type": "gene_name",
  "search_mode": "full",
  "discovery_method": "prediction",
  "motif_mode": "pssm",
  "find_region": "PSSM",
  "pssm_json": { "...": "matrix object per API schema" },
  "pssm_min_score": 0.0,
  "columns": [
    "identifier", "gene", "start", "end",
    "pssm_score", "disorder_combined", "am"
  ]
}
```

Or `pssm_input_format: "tsv"` with `pssm_tsv` multiline string ([../TOOLS.md](../TOOLS.md) §5).

## Supplementary notes

- Same PSSM machinery exists in **Summary Custom regions** for single-protein exploration.
- `GET /api/v1/batch/analyze/` returns field documentation.
- **References:** [../../pages/biological/batch_analysis.md](../../pages/biological/batch_analysis.md); API partial in `templates/DisCanVis/Documentation/partials/_api_rest_and_python.html`.
