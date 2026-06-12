# Example 23 — AFF2/3/4 shared SIAH degron pathomechanism

## Question

Do neurodevelopmental disorders affecting AFF2, AFF3, and AFF4 share common pathomechanisms?

## Answer

All three harbor predicted **SIAH degron** motifs in **IDRs**. **ClinVar** pathogenic/VUS variants **cluster in these PEM hotspots** (HotspotPEM-style enrichment), supporting disrupted **protein turnover** as a shared mechanism.

## Portal page

**Batch Analysis** or **Summary** per gene.

## Tools (in order)

### 1. `batch_analyze`

```json
POST /api/v1/batch/analyze/
{
  "roi": "AFF2\nAFF3\nAFF4",
  "search_type": "gene_name",
  "search_mode": "region",
  "discovery_method": "annotation",
  "find_region": "PEM",
  "columns": ["gene", "region_name", "start", "end", "clinvar", "am", "disorder_combined"]
}
```

### 2. Per-gene: `get_protein_full`

For Visual Overview evidence and AlphaMissense islands.

## Supplementary notes

- Links to **SIAH1 PPI** hub biology (example [09](09_siah1_ppi_disordered_partners.md)).
- Disorders: e.g. intellectual disability syndromes — cite ClinVar disease names from API rows.
- **References:** [../../README_CAPABILITIES.md](../../README_CAPABILITIES.md) §3.4; [examples/09](09_siah1_ppi_disordered_partners.md).
