# Example 13 — WNK3 degron TCGA missense burden

## Question

How many cancer missense mutations fall into the degron motif of the WNK3 protein?

## Answer

The WNK3 **PEM-predicted degron** contains **6 TCGA missense** mutations in the current database build, ranking it **4th** among high-burden degrons after drivers such as **CTNNB1**, **NFE2L2**, and **MYC** (cohort ranking from batch or ROI browse).

## Portal page

**Browse Tables** (mutated regions / driver-associated motif tables) or **Batch Analysis** with PEM discovery.

## Tools (in order)

### 1. `batch_analyze`

```json
POST /api/v1/batch/analyze/
{
  "roi": "WNK3\nCTNNB1\nNFE2L2\nMYC",
  "search_type": "gene_name",
  "search_mode": "region",
  "discovery_method": "annotation",
  "find_region": "PEM",
  "columns": ["gene", "region_name", "start", "end", "tcgam", "pem"]
}
```

Filter PEM rows where ELM type / class matches **degron** (inspect `region_name` / PEM metadata in output).

### 2. Optional: `browse_roi_table`

For genome-wide significantly mutated region rankings.

## Supplementary notes

- Rankings are **database-version dependent** — recompute from `tcgam` column sums.
- **References:** [../../README_CAPABILITIES.md](../../README_CAPABILITIES.md) §5.2; [../TOOLS.md](../TOOLS.md) §5, §10.
