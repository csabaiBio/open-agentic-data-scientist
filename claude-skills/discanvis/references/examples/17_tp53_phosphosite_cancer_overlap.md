# Example 17 — TP53 N-terminal phosphosites vs cancer mutations

## Question

Are there phosphorylation sites in the N-terminal region of TP53 that are frequently mutated in cancer?

## Answer

**Yes.** **PTM** phosphorylation sites (e.g. **S15**, **S20**, **S46**) in the **N-terminal IDR** overlap dense **TCGA missense** hotspots — visible as stacked PTM and somatic tracks in Visual Overview.

## Portal page

**Summary → Visual Overview**.

## Tools (in order)

### 1. `get_region`

```http
GET /rest/TP53/1-100.json?search_type=gene_name
```

### 2. `get_annotation`

```http
GET /rest/TP53/ptm?search_type=gene_name
GET /rest/TP53/tcgam?search_type=gene_name
```

Intersect positions programmatically.

## Supplementary notes

- TP53 N-terminal phosphosites regulate stability and interactome (ATM/CHK2 pathways).
- Include **ClinVar** for germline Li-Fraumeni context if asked clinically.
- **References:** [../../README_CAPABILITIES.md](../../README_CAPABILITIES.md) §2.1; [../DATABASE_SCHEMA.md](../DATABASE_SCHEMA.md) (PTM, TCGAMissense).
