# Example 19 — HMGB1 C-terminal frameshift (LLPS / nucleolus)

## Question

What are the structural and functional consequences of a frameshift mutation at the C-terminus of HMGB1?

## Answer

A frameshift mutation in **HMGB1** replaces its intrinsically disordered acidic tail with an aberrant, arginine-rich basic tail. This novel sequence alters the protein's **liquid–liquid phase separation (LLPS)** properties, enhancing its partitioning into the **nucleolus** and ultimately causing **nucleolar dysfunction**.

## Rationale

Compare the wild-type sequence against the truncated sequence following the reading-frame shift in **Variant Interpretation**; evaluate biophysical changes (charge shift, altered **LLPS** propensity) of the newly generated tail.

## Portal page

**Variant Interpretation** — WT vs mutant alignment, disorder/LLPS-related readouts, structure cards.

## Tools (in order)

### 1. `variant_interpret`

Submit frameshift definition for **HMGB1** — inspect the **changed C-terminal sequence block**, alignment view, and phase-separation / nucleolar context in the report.

### 2. `get_region` / `get_annotation`

After VI resolves coordinates for the novel tail, pull disorder and annotation layers as needed for the C-terminal window.

## Image placeholder

Visual representation of **WT vs mutant** sequence alignment highlighting the **basic tail**, alongside altered **phase separation / nucleolar partitioning**.

## Scientific reference

Mensah, M. A., et al. (2023). Aberrant phase separation and nucleolar dysfunction in rare genetic diseases. *Nature*, 614, 564–571.

## Supplementary notes

- Indel/frameshift remapping is non-trivial — use VI for coordinates after the shift.
- LLPS and nucleolar phenotypes are **computational / literature-backed** in this workflow — validate experimentally.
