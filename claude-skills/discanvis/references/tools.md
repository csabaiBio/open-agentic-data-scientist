# DisCanVis AI Chat — tool catalog

Each tool below maps to a **live HTTP endpoint** on the DisCanVis server. The agent should call tools in the order listed in [examples/SUMMARY.md](examples/SUMMARY.md) for each question type.

**Base URL:** deployment host (e.g. `https://discanvis.org`). Paths are site-root relative.

**Common query parameter:** `search_type` = `gene_name` | `uniprot` | `transcript` | omit for GENCODE accession.

---

## 1. `get_protein_full`

**Use when:** You need the **entire annotation bundle** for one protein (sequence, all layers, variant lists).

| | |
|--|--|
| **Method** | `GET` |
| **Path** | `/rest/{identifier}.json` |
| **Input** | `identifier` (gene, UniProt, or GENCODE accession); optional `search_type` |
| **Output** | Large JSON: `protein` metadata, `sequence`, vectors (disorder, pLDDT, …), arrays (Pfam, ELM, PEM, mutations, …) |
| **Also** | `.txt` (TSV-style), `.fasta` |

**Prefer over** repeated `get_annotation` calls when exploring hotspots, comparing tracks, or answering “where are mutations concentrated?”.

**Portal equivalent:** Search → Summary → Visual Overview.

---

## 2. `get_annotation`

**Use when:** You need **one layer** only (lighter payload).

| | |
|--|--|
| **Method** | `GET` |
| **Path** | `/rest/{identifier}/{model}` |
| **Input** | `identifier`, `model` slug, optional `search_type` |
| **Output** | JSON array or object for that layer |

**Common `model` values:** `protein`, `exon`, `phastcons`, `pfam`, `elm`, `elmswitches`, `ptm`, `mobidb`, `alphafold`, `iupred`, `anchor`, `aiupred-binding`, `tcgam`, `tcgaf`, `tcgai`, `cosmicm`, `cosmicf`, `cosmici`, `cbioportalm`, `cbioportalf`, `cbioportali`, `clinvar`, `omim`, `pathogenicity`, `pdb`, `roi`, `binding`, `dibs`, `mfib`, `phasepro`, `conservation`, `roisig`.

---

## 3. `get_region`

**Use when:** The question specifies **coordinates** (e.g. aa 30–40, C-terminal IDR, motif span).

| | |
|--|--|
| **Method** | `GET` |
| **Path** | `/rest/{identifier}/{start}-{end}.json` |
| **Input** | `identifier`, `start`, `end` (1-based inclusive), optional `search_type` |
| **Output** | Subset of annotations intersecting the interval: mutations, motifs, mean disorder, pathogenicity slice, etc. |

**Portal equivalent:** Summary → Custom view (user-defined region) or Visual region focus.

---

## 4. `get_position`

**Use when:** The question is about **one residue** or **one missense change** (e.g. D32Y, P485L).

| | |
|--|--|
| **Method** | `GET` |
| **Path** | `/rest/{identifier}/{position}.json` |
| **Input** | `identifier`, `position` (1-based), optional `search_type` |
| **Output** | Pfam/ELM/PTM/exon context at site, ClinVar/OMIM/somatic rows at site, pathogenicity scores, disorder value |

**Combine with** `variant_interpret` for motif gain/loss narrative.

**Portal equivalent:** Summary tables; Mutation/sample browser (position-first).

---

## 5. `batch_analyze`

**Use when:** **Many proteins/regions**, **regex/PSSM** motif search, **GO/PPI cohorts**, disorder filters, island pathogenicity, aggregated counts.

| | |
|--|--|
| **Method** | `POST` |
| **Path** | `/api/v1/batch/analyze/` |
| **Content-Type** | `application/json` |
| **Input (core)** | See table below |
| **Output** | `{ "rois": [...], "header": [...], "errors": [...], "threshold": {...}, "cohort_statistics": {...}? }` |

| Field | Meaning |
|-------|---------|
| `roi` | Newline-separated lines: `GENE` or `ACCESSION` or `ID start end` |
| `search_type` | `gene_name`, `uniprot`, `gencode` |
| `search_mode` | `region` (discover/split regions) or `full` (whole protein rows) |
| `discovery_method` | `annotation` (database regions) or `prediction` (regex/PSSM) |
| `find_region` | e.g. `Elm`, `PEM`, `MobiDB`, `Pfam`, `PhasePro`, `PSSM` |
| `regex_input` | Regex when `motif_mode`: `regex` |
| `motif_mode` | `regex` or `pssm` |
| `pssm_json` / `pssm_tsv` | Matrix for PSSM mode |
| `columns` | Output metrics (see API docs) |
| `enforce_disorder_cutoff`, `disorder_min_percent` | Filter segments by disorder fraction |
| `island_pathogenicity`, `island_*` | Flank vs core AlphaMissense/conservation |

**Discovery without coordinates:** omit start/end on each line → server expands to ELM/PEM/MobiDB/… segments.

**Portal equivalent:** Batch Analysis page.

---

## 6. `get_go_proteins`

**Use when:** Question mentions a **GO term** (e.g. circadian rhythm).

| | |
|--|--|
| **Method** | `GET` |
| **Path** | `/ajax/go-genes/?id={GO_ID}` |
| **Input** | `GO:0007623` style ID |
| **Output** | `{ "accessions": [...], "genes": [...] }` (main isoforms) |

**Then:** pass `accessions` to `batch_analyze` with `search_type: "gencode"`.

---

## 7. `get_ppi_neighborhood`

**Use when:** Question involves **interaction partners** of a hub (e.g. SIAH1 PPI).

| | |
|--|--|
| **Method** | `GET` |
| **Path** | `/ajax/ppi-proteins/?hub={GENE}` |
| **Optional** | `&ppi_sources=intact,hippie,biogrid` |
| **Output** | `{ "accessions": [...], "genes": [...] }` |

**Then:** `batch_analyze` or per-protein `get_protein_full` on partners.

**Portal equivalent:** PPI network browse; Statistics → PPI neighbourhood preset.

---

## 8. `get_statistics`

**Use when:** Question needs **cohort percentages** (e.g. % cancer drivers mutated in IDRs).

| | |
|--|--|
| **Method** | `GET` |
| **Path** | `/statistics/api/` |
| **Input** | Query params as used by Statistics UI (preset: human proteome, Cancer Gene Census, custom GO/PPI set) |
| **Output** | JSON chart/table payloads: disorder distribution, mutation mix, ClinVar roll-ups, pathogenicity histograms |

**Portal equivalent:** Statistics page.

---

## 9. `browse_dynamic` / `browse_precompiled`

**Use when:** User wants a **filterable gene list** (drivers + experimental disorder, mutation thresholds).

| | |
|--|--|
| **Method** | `GET` |
| **Paths** | `/browse/dynamic/data/`, `/browse/precompiled/data/` |
| **Input** | Filter parameters (disorder fraction, driver flags, somatic counts, annotation columns) — mirror UI filters |
| **Output** | DataTables JSON rows → open Summary for detail |

**Portal equivalent:** Dynamic Search; Precompiled tables.

---

## 10. `browse_roi_table`

**Use when:** Ranking **degron / motif mutation burden** across proteins (e.g. WNK3 vs CTNNB1).

| | |
|--|--|
| **Method** | `GET` |
| **Path** | `/browse/roi/data/` |
| **Output** | Significantly mutated / ROI browse rows |

**Alternative:** `batch_analyze` with PEM + `columns` including `tcgam`, sorted client-side.

---

## 11. `variant_interpret`

**Use when:** Explicit **WT vs mutant** comparison, **motif gain/loss**, indel/frameshift **new C-tail**, LLPS property change.

| | |
|--|--|
| **Method** | `POST` |
| **Paths** | `/variant-interpretation/api/resolve-sequences/` (build sequences) |
| | `/variant-interpretation/` (full report via form workflow) |
| **Input** | Protein id or pasted sequences; HGVS-like or coordinate mutation |
| **Output** | Sequences, motif diff (ELM regex), pathogenicity_tools, ClinVar highlight, PhasePro/DIBS/MFIB context |

**Portal equivalent:** Variant Interpretation page.

**Note:** Motif gain/loss uses ELM class patterns; always cite predicted vs curated.

---

## 12. `get_bulk_download_manifest`

**Use when:** User wants **genome-wide TSV** (e.g. TCGA mutations × PhasePro).

| | |
|--|--|
| **Method** | User-directed download |
| **Path** | `/access_data` (Downloads page) |
| **Output** | Pre-joined files: mutation × region tables, proteome FASTA, layer TSVs |

**Agent behavior:** Return exact file category name from Downloads UI; do not fabricate URLs without checking manifest.

---

## Tool selection guide (quick)

| Question pattern | Primary tools |
|------------------|---------------|
| One gene, “where / how concentrated” | `get_protein_full` |
| Single amino acid change | `get_position` → `variant_interpret` |
| Custom coordinates | `get_region` |
| Many genes or regex motif | `batch_analyze` |
| GO term gene set | `get_go_proteins` → `batch_analyze` |
| PPI partners | `get_ppi_neighborhood` → `batch_analyze` or `get_protein_full` × N |
| Proteome % / distribution | `get_statistics` |
| Filtered tables | `browse_dynamic` / `browse_precompiled` |
| Bulk offline file | `get_bulk_download_manifest` |
| Deep MSA ortholog / Mol* | Portal Summary (no single REST tool) |

---

## Composition pattern (example)

**“Which proteins have the SIAH degron regex?”**

1. `batch_analyze` — `roi`: list of accessions or proteome subset; `discovery_method`: `prediction`; `regex_input`: `.[PAV]P[^P]`; `enforce_disorder_cutoff`: true.
2. Optionally `get_position` on top hits for ClinVar/TCGA at motif sites.

---

## Limits (tell the user when relevant)

- Not a diagnostic classifier (ACMG/AMP).
- Main isoform default may differ from clinical transcript choice.
- MSA ortholog view and Mol* structure are **UI-heavy**; REST gives conservation vectors and pLDDT/RSA, not interactive alignments.
- See [../README_CAPABILITIES.md](../README_CAPABILITIES.md) §8.
