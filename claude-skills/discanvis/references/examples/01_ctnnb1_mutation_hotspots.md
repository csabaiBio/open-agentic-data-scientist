# Example 01 — CTNNB1 mutation hotspots vs disorder

## Question

Where are the pathogenic mutations concentrated in the beta-catenin (CTNNB1) protein? Do they fall into disordered or structured regions?

## Answer

In CTNNB1, pathogenic and cancer-associated mutations **cluster in the N-terminal intrinsically disordered region (IDR)**. Hotspots overlap **predicted degradation motifs (PEM/degrons)** and **phosphorylation sites** (e.g. GSK3/CK1 regulatory phosphosites), not the armadillo repeat structured core.

## Portal page

**Summary → Visual Overview** (enable ClinVar, TCGA, Combined Disorder, ELM, PEM, PTM tracks).

## Tools (in order)

### 1. `get_protein_full`

```http
GET /rest/CTNNB1.json?search_type=gene_name
```

Inspect: `CombinedDisorder` / `IUPred` vectors vs `TCGAMissense`, `ClinVarDisease`, `PEM_Core_Motifs`, `PTM` positions.

### 2. `get_region` (N-terminal IDR, approximate)

```http
GET /rest/CTNNB1/1-100.json?search_type=gene_name
```

Compare mutation density and mean disorder to C-terminal structured armadillo region (`get_region` 100–end).

### 3. Optional: `get_annotation`

```http
GET /rest/CTNNB1/pem?search_type=gene_name
GET /rest/CTNNB1/ptm?search_type=gene_name
```

## Supplementary notes

- CTNNB1 N-terminal phosphorylation/degron biology is a classic Wnt pathway mechanism; DisCanVis integrates **TCGA**, **ClinVar**, **PEM** (HotspotPEM-style predictions), and **combined disorder** on one axis.
- For armadillo **structured** domain boundaries, cross-check **Pfam** (`get_annotation` `pfam`).
- **References:** [../../README_CAPABILITIES.md](../../README_CAPABILITIES.md) §2.1; [../../pages/biological/summary.md](../../pages/biological/summary.md); [../TOOLS.md](../TOOLS.md) §1–3.
