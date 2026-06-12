# Example 11 — % cancer drivers mutated in IDRs

## Question

What percentage of cancer driver proteins are mutated through their intrinsically disordered regions?

## Answer

Site statistics over **Cancer Gene Census** drivers report roughly **~21%** of driver genes with mutations preferentially affecting **IDRs** (ordered vs disordered placement from combined disorder thresholding at mutation sites).

## Portal page

**Statistics** → preset **Cancer Gene Census**.

## Tools (in order)

### 1. `get_statistics`

```http
GET /statistics/api/?<preset=Cancer Gene Census parameters>
```

Use the same query bundle as the Statistics UI (inspect network tab or [../../pages/technical/statistics.md](../../pages/technical/statistics.md) for exact keys).

Parse charts/tables for **disordered vs ordered** mutation placement among drivers.

## Supplementary notes

- Exact percentage depends on snapshot build and disorder cutoff — quote the API payload value, not a hard-coded constant.
- Complements per-protein views; not replaceable by single `get_protein_full`.
- **References:** [../../pages/biological/statistics.md](../../pages/biological/statistics.md); [../TOOLS.md](../TOOLS.md) §8.
