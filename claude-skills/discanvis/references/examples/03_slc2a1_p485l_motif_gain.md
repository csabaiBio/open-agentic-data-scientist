# Example 03 — SLC2A1 P485L de novo motif

## Question

What could be the pathogenic mechanism of the SLC2A1 P485L mutation?

## Answer

A **de novo motif is created** that alters **localization**: **TRG_DiLeu_BaEn_1** (**ELME000523**) — Adaptin binding · Endosome–Lysosome–Basolateral sorting signals. Classical missense predictors often call the SNV **benign**, while motif-mediated sorting/localization change can be **biologically pathogenic**.

## Portal page

**Variant Interpretation** (ELM class comparison WT vs mutant).

## Tools (in order)

### 1. `variant_interpret`

Mutation `P485L` on SLC2A1 — inspect motif gain/loss table in the report.

### 2. `get_position`

```http
GET /rest/SLC2A1/485.json?search_type=gene_name
```

Disorder score, PEM/ELM at site, dbNSFP pathogenicity bundle.

### 3. `get_annotation`

```http
GET /rest/SLC2A1/pathogenicity?search_type=gene_name
```

Extract SIFT, Polyphen2, ClinPred, AlphaMissense at 485 for contrast (see example 12).

## Supplementary notes

- Teach users the **IDR blind spot**: structure-centric predictors under-call short linear motif mechanisms.
- **References:** [../../README_CAPABILITIES.md](../../README_CAPABILITIES.md) §3.2, §4; [../../pages/biological/variant_interpretation.md](../../pages/biological/variant_interpretation.md).
