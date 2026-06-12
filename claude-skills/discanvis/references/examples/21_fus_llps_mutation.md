# Example 21 — FUS mutation and LLPS

## Question

Does a mutation in the FUS protein alter its liquid-liquid phase separation (LLPS) properties?

## Answer

**Variant Interpretation** comparing WT vs mutant shows shifts in **PhasePro** (and related **disorder/binding**) scores over the **low-complexity / disordered** region, consistent with altered **droplet propensity** and pathological aggregation risk.

## Portal page

**Variant Interpretation** and **Summary** (PhasePro track).

## Tools (in order)

### 1. `variant_interpret`

User-specified FUS mutation — inspect PhasePro / disorder delta in report curated/predicted regions.

### 2. `get_annotation`

```http
GET /rest/FUS/phasepro?search_type=gene_name
GET /rest/FUS/iupred?search_type=gene_name
```

On WT; compare region scores manually or via VI remapped coordinates.

### 3. `get_region` (LC/IDR span)

Cover known FUS LC domain from literature coordinates.

## Supplementary notes

- PhasePro predicts **phase-separation propensity** regions; not a direct biophysical LLPS assay.
- Pair with **DIBS/MFIB** if binding-coupled condensation is relevant.
- **References:** [../DATABASE_SCHEMA.md](../DATABASE_SCHEMA.md) (Binding_MFIB_Phasepro_Dibs); example [16](16_download_phasepro_tcga.md).
