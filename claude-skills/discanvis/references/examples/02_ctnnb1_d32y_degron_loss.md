# Example 02 — CTNNB1 D32Y degron loss

## Question

What is the functional effect of the D32Y mutation in CTNNB1?

## Answer

**D32Y** removes a predicted **SCF^TRCP1** phosphodegron motif (**DEG_SCF_TRCP1_1** / ELM class). Motif **loss** reduces ubiquitin-mediated degradation signaling, allowing β-catenin accumulation — consistent with oncogenic Wnt activation.

## Portal page

**Variant Interpretation** (WT vs mutant; motif gain/loss panel).

## Tools (in order)

### 1. `get_position`

```http
GET /rest/CTNNB1/32.json?search_type=gene_name
```

Confirm disorder context, overlapping ELM/PEM, phosphosites.

### 2. `variant_interpret`

```json
POST /variant-interpretation/api/resolve-sequences/
{
  "identifier": "CTNNB1",
  "search_type": "gene_name",
  "mutation": "D32Y"
}
```

Then run full VI workflow for motif diff and interpretation report sections.

### 3. `get_annotation` (motif catalog)

```http
GET /rest/CTNNB1/elm?search_type=gene_name
```

Filter instances spanning position 32.

## Supplementary notes

- D32 is part of the **D-S-G-…-pS/pT** degron consensus; Y32 disrupts the acidic anchor required for TRCP recognition.
- Pair with **pathogenicity** at position 32 (`get_position` includes `pathogenicity` block) but emphasize **mechanism** over single scores.
- **References:** [../../pages/biological/variant_interpretation.md](../../pages/biological/variant_interpretation.md); [../TOOLS.md](../TOOLS.md) §4, §11.
