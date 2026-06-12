# Example 18 — PTEN TCGA vs ClinVar landscapes

## Question

What is the difference between the PTEN mutational landscape in cancer (TCGA) and inherited diseases (ClinVar)?

## Answer

**TCGA** somatic missense/indel events are **spread across structured phosphatase domain and C-tail** regions, while **ClinVar** pathogenic germline variants highlight **distinct hotspots** (e.g. phosphatase active site, C-tail regulatory motifs) with a different spatial distribution — best seen by **side-by-side tracks**.

## Portal page

**Summary → Visual Overview** and **Clinical Views**.

## Tools (in order)

### 1. `get_protein_full`

```http
GET /rest/PTEN.json?search_type=gene_name
```

Compare `TCGAMissense` vs `ClinVarDisease` position histograms along sequence.

### 2. Optional: `get_annotation` per layer

```http
GET /rest/PTEN/tcgam?search_type=gene_name
GET /rest/PTEN/clinvar?search_type=gene_name
GET /rest/PTEN/pfam?search_type=gene_name
```

## Supplementary notes

- Cowden syndrome / PTEN hamartoma tumor syndrome vs sporadic cancer spectra differ in variant class mix — mention frameshift/indels if present in payload.
- **References:** [../../pages/biological/summary.md](../../pages/biological/summary.md); [../../pages/biological/variant_interpretation.md](../../pages/biological/variant_interpretation.md).
