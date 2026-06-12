# Example 07 — Cancer drivers with experimental disorder

## Question

Show a list of known cancer driver proteins that have experimentally verified disordered regions.

## Answer

Filter **Cancer Gene Census** drivers intersecting **MobiDB** experimental disorder segments — exemplars include **TP53**, **MYC**, **BRCA1**.

## Portal page

**Browse Tables** → Dynamic or Precompiled search (driver + MobiDB columns).

## Tools (in order)

### 1. `browse_dynamic` or `browse_precompiled`

Request rows where `cancer_driver` indicates Census membership and MobiDB disorder fraction &gt; 0 (exact filter keys match UI — see [../../pages/technical/search.md](../../pages/technical/search.md)).

### 2. `get_protein_full` (spot-check)

```http
GET /rest/TP53.json?search_type=gene_name
```

Verify `MobiDBDisorder` features vs `CombinedDisorder`.

## Supplementary notes

- **Experimental** disorder = MobiDB evidence types; **predicted** = IUPred/combined — do not conflate in the answer.
- Driver labels come from `DriverGenesCensus` / `Protein.cancer_driver` field.
- **References:** [../../README_CAPABILITIES.md](../../README_CAPABILITIES.md) §6; [../DATABASE_SCHEMA.md](../DATABASE_SCHEMA.md).
