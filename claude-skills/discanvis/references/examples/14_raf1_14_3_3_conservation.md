# Example 14 — RAF1 14-3-3 binding motif conservation

## Question

Is the 14-3-3 binding phosphopeptide motif of the RAF1 protein conserved throughout evolution?

## Answer

**Yes.** The **RSXpSXP** 14-3-3 binding motif around **S259** shows strong **PhastCons** and multi-level **MSA conservation** (vertebrate through broader eukaryotic signal in conservation tracks). Portal **Orthologs** tab shows alignment-level detail back to **Eumetazoa/Eukaryota**.

## Portal page

**Summary → Orthologs** (MSA track) + Visual Overview (PhastCons).

## Tools (in order)

### 1. `get_position`

```http
GET /rest/RAF1/259.json?search_type=gene_name
```

### 2. `get_region` (motif span, e.g. 256–263)

```http
GET /rest/RAF1/256-263.json?search_type=gene_name
```

### 3. `get_annotation`

```http
GET /rest/RAF1/conservation?search_type=gene_name
GET /rest/RAF1/phastcons?search_type=gene_name
GET /rest/RAF1/ptm?search_type=gene_name
```

## Supplementary notes

- Full **taxonomic depth labels** on MSA are UI-rendered from `Insertion_Free_Alignment` — agent should direct users to Orthologs view for publication figures.
- S259 phosphorylation regulates RAF1 autoinhibition via 14-3-3.
- **References:** [../../pages/biological/summary.md](../../pages/biological/summary.md); [../DATABASE_SCHEMA.md](../DATABASE_SCHEMA.md) (conservation models).
