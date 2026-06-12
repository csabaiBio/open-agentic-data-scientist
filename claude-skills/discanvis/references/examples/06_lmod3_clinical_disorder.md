# Example 06 — LMOD3 disease mutations in disorder

## Question

What diseases are associated with mutations in the disordered regions of LMOD3?

## Answer

Pathogenic variants in the **C-terminal disordered region** (e.g. **R543L**, **L550F**) are associated with **nemaline myopathy**. Mutations overlap a predicted **actin-binding WH2** motif (PEM/ELM).

## Portal page

**Summary → Clinical Views** and **Visual Overview**.

## Tools (in order)

### 1. `get_protein_full`

```http
GET /rest/LMOD3.json?search_type=gene_name
```

### 2. `get_region` (C-terminal IDR)

```http
GET /rest/LMOD3/500-600.json?search_type=gene_name
```

(Adjust end to protein length from `protein` metadata.)

### 3. `get_annotation`

```http
GET /rest/LMOD3/clinvar?search_type=gene_name
GET /rest/LMOD3/pem?search_type=gene_name
```

## Supplementary notes

- Cross-link **OMIM** disease names via `get_annotation` `omim`.
- WH2 motifs mediate actin binding; disorder may allow regulatory conformational ensembles.
- **References:** [../../pages/biological/summary.md](../../pages/biological/summary.md) (Clinical Views); [../DATABASE_SCHEMA.md](../DATABASE_SCHEMA.md) (ClinVar models).
