# Example 09 — SIAH1 PPI partners with disorder

## Question

Which interaction partners (PPI) of the SIAH1 protein are themselves intrinsically disordered?

## Answer

**SIAH1** hub partners such as **AFF2**, **AFF3**, **AFF4**, and **FOXP2** show high **disordered region fraction** and often harbor predicted **SIAH degron** motifs (PEM) in their IDRs.

## Portal page

**Batch Analysis** or **PPI network** browse → Summary for each partner.

## Tools (in order)

### 1. `get_ppi_neighborhood`

```http
GET /ajax/ppi-proteins/?hub=SIAH1
```

### 2. `batch_analyze`

```json
POST /api/v1/batch/analyze/
{
  "roi": "<paste accessions from step 1>",
  "search_type": "gencode",
  "search_mode": "full",
  "columns": ["identifier", "gene", "disorder_combined", "pem", "mobidb"]
}
```

### 3. Optional per partner: `get_protein_full`

For FOXP2/AFF family detail and degron positions.

## Supplementary notes

- PPI sources (IntAct, HIPPIE, BioGRID) can be narrowed with `ppi_sources` query param.
- Same pattern as Statistics **PPI neighbourhood** preset.
- **References:** [../TOOLS.md](../TOOLS.md) §6–7; [../../README_CAPABILITIES.md](../../README_CAPABILITIES.md) §3.4.
