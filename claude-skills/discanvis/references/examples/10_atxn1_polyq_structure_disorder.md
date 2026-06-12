# Example 10 — ATXN1 polyQ tract structure vs disorder

## Question

Is the polyQ tract of Ataxin-1 (ATXN1) predicted to be structured or disordered?

## Answer

Annotations **disagree**: **AlphaFold2** (pLDDT) can suggest local helical order in the polyQ-adjacent segment, while **IUPred3** and **combined disorder** classify the tract as **disordered**. **MobiDB** experimental annotations support a **dynamic, disordered** polyQ expansion context.

## Portal page

**Summary → Visual Overview** (AlphaFold/pLDDT, IUPred, Combined Disorder, MobiDB).

## Tools (in order)

### 1. Identify polyQ coordinates

From `get_protein_full` sequence — locate consecutive Q stretch (gene-dependent isoform).

### 2. `get_region`

```http
GET /rest/ATXN1/{polyQ_start}-{polyQ_end}.json?search_type=gene_name
```

### 3. `get_annotation`

```http
GET /rest/ATXN1/alphafold?search_type=gene_name
GET /rest/ATXN1/iupred?search_type=gene_name
GET /rest/ATXN1/mobidb?search_type=gene_name
```

## Supplementary notes

- PolyQ diseases illustrate **conflict between structure prediction and disorder** — report all layers transparently.
- Expansion length may differ by allele; VI page handles indels if user provides mutant sequence.
- **References:** [../DATABASE_SCHEMA.md](../DATABASE_SCHEMA.md) (PLLDTscores, MobiDBDisorder); [../../README_CAPABILITIES.md](../../README_CAPABILITIES.md) §4.3.
