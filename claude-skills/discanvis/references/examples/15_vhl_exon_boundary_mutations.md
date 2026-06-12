# Example 15 — VHL mutations near exon boundaries

## Question

Are the cancer-associated pathogenic mutations of the VHL gene located near exon boundaries?

## Answer

Comparing **exon border** positions with **TCGA/ClinVar** variant locations shows many VHL mutations **cluster at exon edges**, compatible with **splicing disruption** hypotheses (in addition to protein-level loss of pVHL function).

## Portal page

**Summary → Visual Overview** (Exons + Cancer + Disease tracks).

## Tools (in order)

### 1. `get_protein_full`

```http
GET /rest/VHL.json?search_type=gene_name
```

### 2. `get_annotation`

```http
GET /rest/VHL/exon?search_type=gene_name
GET /rest/VHL/tcgam?search_type=gene_name
GET /rest/VHL/clinvar?search_type=gene_name
```

Programmatically compute distance from each variant position to nearest exon start/end.

## Supplementary notes

- Exon coordinates are **protein-aligned** exon blocks from `Exonborders.borders` text format.
- Splicing validation requires external RNA assays — state as hypothesis.
- **References:** [../DATABASE_SCHEMA.md](../DATABASE_SCHEMA.md) (Exonborders); [../../pages/biological/summary.md](../../pages/biological/summary.md).
