# Example 04 — FOXP2 AlphaMissense islands in disorder

## Question

How does AlphaMissense score the disordered regions of the FOXP2 protein? Are there "pathogenicity islands"?

## Answer

AlphaMissense shows **localized island-like peaks** in FOXP2 disordered segments, notably around residues **449–457**, coinciding with a predicted **SIAH degron** (PEM) in the IDR.

## Portal page

**Summary → Pathogenicity** view (AlphaMissense track + PEM overlay).

## Tools (in order)

### 1. `get_protein_full`

```http
GET /rest/FOXP2.json?search_type=gene_name
```

Scan `AlphaMissense` / pathogenicity vectors against `CombinedDisorder` high regions.

### 2. `get_region`

```http
GET /rest/FOXP2/440-470.json?search_type=gene_name
```

Compute mean AlphaMissense in core vs flanks.

### 3. `batch_analyze` (island filter)

```json
POST /api/v1/batch/analyze/
{
  "roi": "FOXP2",
  "search_type": "gene_name",
  "search_mode": "region",
  "discovery_method": "annotation",
  "find_region": "PEM",
  "island_pathogenicity": true,
  "island_metric": "alphamissense",
  "columns": ["identifier", "start", "end", "disorder_combined", "am", "pem"]
}
```

## Supplementary notes

- **Island pathogenicity** in batch compares motif-core vs flanking mean AlphaMissense ([../TOOLS.md](../TOOLS.md) §5).
- FOXP2 is linked to speech/language disorders; connect ClinVar if user asks clinically.
- **References:** [../../README_CAPABILITIES.md](../../README_CAPABILITIES.md) §3.3, §4.1; [../DATABASE_SCHEMA.md](../DATABASE_SCHEMA.md) (pathogenicity models).
