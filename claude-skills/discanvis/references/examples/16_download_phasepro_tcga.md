# Example 16 — Download PhasePro × TCGA overlaps

## Question

I want to download the coordinates of all predicted phase-separation regions (PhasePro) that overlap with TCGA mutations. How can I do this?

## Answer

Use **Downloads / Access Data**: pre-joined **mutation × region** TSV files include somatic (**TCGA**) mutations overlapping **PhasePro** (and related) annotations genome-wide.

## Portal page

**Downloads** (`/access_data`).

## Tools (in order)

### 1. `get_bulk_download_manifest`

Direct the user to `/access_data` → category **Mutation × regions** (or equivalent manifest label for TCGA × PhasePro).

No REST tool returns the full proteome file inline — provide manifest path and file description from the live page.

## Supplementary notes

- Same join logic powers internal browse/ROI pipelines — good for offline R/Python overlap stats.
- Per-protein subset: `get_region` + `phasepro` + `tcgam` for one accession only.
- **References:** [../../pages/biological/downloads.md](../../pages/biological/downloads.md); [../TOOLS.md](../TOOLS.md) §12.
