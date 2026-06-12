# Example 08 — β-catenin residues 30–40

## Question

How can I analyze a custom sequence region of Beta-catenin (e.g., amino acids 30–40) to see if it is conserved and disordered?

## Answer

Region **30–40** is **intrinsically disordered** (high combined disorder / IUPred) and **evolutionarily conserved** (PhastCons + MSA conservation tracks), consistent with the **GSK3β** phosphorylation/degron regulatory segment.

## Portal page

**Summary → Custom View** (define region 30–40; enable Combined Disorder, PhastCons, Orthologs/MSA).

## Tools (in order)

### 1. `get_region`

```http
GET /rest/CTNNB1/30-40.json?search_type=gene_name
```

Returns disorder means, conservation scores, overlapping PTMs/motifs.

### 2. `get_annotation`

```http
GET /rest/CTNNB1/phastcons?search_type=gene_name
GET /rest/CTNNB1/conservation?search_type=gene_name
```

Slice vectors to positions 30–40.

## Supplementary notes

- **MSA ortholog ribbon** is richest in the portal Orthologs tab; REST gives numeric conservation levels per residue.
- Custom view also supports user **regex/PSSM** regions ([../../README_CAPABILITIES.md](../../README_CAPABILITIES.md) §2.2).
- **References:** [../TOOLS.md](../TOOLS.md) §3; [../../pages/biological/summary.md](../../pages/biological/summary.md).
