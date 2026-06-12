# Example 25 — EGFR sequence, domains, annotations

## Question

What is the exact sequence of the EGFR protein, what Pfam domains does it contain, and where are its main annotations located?

## Answer

**EGFR** sequence spans extracellular **Pfam** domains (structured), a transmembrane segment, a **kinase domain**, and a **C-terminal tail** classified as **disordered** with dense **PTMs** and **somatic mutation** hotspots in DisCanVis tracks.

## Portal page

**Search → Summary** (Visual Overview + Tables).

## Tools (in order)

### 1. `get_protein_full`

```http
GET /rest/EGFR.json?search_type=gene_name
```

Returns `sequence`, `PFam`, mutations, disorder vectors, PTMs.

### 2. `get_annotation` (focused layers)

```http
GET /rest/EGFR/pfam?search_type=gene_name
GET /rest/EGFR/ptm?search_type=gene_name
GET /rest/EGFR/pdb?search_type=gene_name
GET /rest/EGFR/iupred?search_type=gene_name
GET /rest/EGFR/tcgam?search_type=gene_name
```

### 3. FASTA export (optional)

```http
GET /rest/EGFR.fasta?search_type=gene_name
```

## Supplementary notes

- Confirm **isoform** (main vs canonical therapeutic isoform) for clinical EGFR tyrosine kinase inhibitor context.
- **PDB** entries highlight extracellular and kinase structured regions; tail often lacks PDB coverage.
- **References:** [../../pages/biological/search.md](../../pages/biological/search.md); [../DATABASE_SCHEMA.md](../DATABASE_SCHEMA.md) (Protein, PFam).
