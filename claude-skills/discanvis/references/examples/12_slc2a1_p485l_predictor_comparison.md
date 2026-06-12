# Example 12 — Pathogenicity predictors for SLC2A1 P485L

## Question

How do different pathogenicity predictors (SIFT, Polyphen2, ClinPred, AlphaMissense) score the P485L mutation in the IDR of SLC2A1?

## Answer

**SIFT**, **Polyphen2**, and **ClinPred** (dbNSFP) typically score **benign/tolerated** in the IDR. **AlphaMissense** may be intermediate. Biological impact is better explained by **de novo motif gain** (example 03) than ensemble missense scores alone.

## Portal page

**Summary → Pathogenicity Comparison** mode (multiple predictor tracks).

## Tools (in order)

### 1. `get_position`

```http
GET /rest/SLC2A1/485.json?search_type=gene_name
```

Read embedded pathogenicity / AlphaMissense fields.

### 2. `get_annotation`

```http
GET /rest/SLC2A1/pathogenicity?search_type=gene_name
```

Full per-position vectors for Polyphen2 HDIV/HVAR, SIFT, ClinPred, etc.

### 3. `variant_interpret`

For motif-centric interpretation alongside scores.

## Supplementary notes

- Distinguish **standalone AlphaMissense** model vs **dbNSFP AlphaMissense column** ([../DATABASE_SCHEMA.md](../DATABASE_SCHEMA.md)).
- **References:** [../../README_CAPABILITIES.md](../../README_CAPABILITIES.md) §4.2; example [03](03_slc2a1_p485l_motif_gain.md).
