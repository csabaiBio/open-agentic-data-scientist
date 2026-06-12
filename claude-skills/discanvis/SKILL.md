---
name: discanvis
description: Answer questions about human proteins using the DisCanVis2 server's HTTP API — intrinsic disorder, cancer/clinical mutations (TCGA, COSMIC, cBioPortal, ClinVar, OMIM), linear motifs and degrons (ELM, PEM), domains (Pfam), PTMs, AlphaFold/pLDDT structure, conservation, AlphaMissense/dbNSFP pathogenicity, LLPS (PhasePro/DIBS/MFIB), PPI partners, and GO gene sets. Use this whenever a user asks where mutations cluster in a protein, the functional effect of a specific variant (e.g. "D32Y in CTNNB1", "P485L"), whether a region is disordered or structured, motif gain/loss, degron mutation burden, proteome-wide regex/PSSM motif scans, GO-term or PPI-partner cohorts, or driver/disorder statistics — even when they don't name DisCanVis. Composes REST/JSON calls (get_protein_full, get_region, get_position, get_annotation, batch_analyze, variant_interpret, GO/PPI lookups) in the order the example workflows prescribe.
license: Proprietary. LICENSE.txt has complete terms
---

# DisCanVis

## Overview

DisCanVis2 is a Django server that stores preprocessed per-residue annotations for human proteins (GENCODE-centric) and exposes them over plain HTTP — REST endpoints returning JSON/TSV/FASTA, plus a few POST and AJAX endpoints. This skill teaches you to pick the right endpoint(s), call them, and synthesize a biologically grounded answer with concrete numbers (disorder fractions, mutation counts, motif IDs).

You do **not** query SQL. Every answer flows through the HTTP tools described below.

## Base URL

All paths are site-root relative. Resolve the host from the `DISCANVIS_BASE_URL` environment variable, falling back to `http://127.0.0.1:8001` (the local DisCanVis dev server, which is where the chat backend runs):

```bash
BASE="${DISCANVIS_BASE_URL:-http://127.0.0.1:8001}"
```

Build full URLs as `$BASE` + the path (e.g. `$BASE/rest/CTNNB1.json?search_type=gene_name`).

## Making calls

Use `curl` via Bash for GET, and `curl -X POST` (or a short Python `requests`/`urllib` snippet) for the JSON POST endpoints. Always set `search_type` when the identifier is not a GENCODE accession:

- gene symbol → `search_type=gene_name` (e.g. `CTNNB1`)
- UniProt → `search_type=uniprot` (e.g. `P04637`)
- Ensembl transcript (with version) → `search_type=transcript`
- omit for a GENCODE protein accession

```bash
# GET one layer
curl -s "$BASE/rest/CTNNB1/elm?search_type=gene_name"

# POST batch
curl -s -X POST "$BASE/api/v1/batch/analyze/" \
  -H 'Content-Type: application/json' \
  -d '{"roi":"CTNNB1","search_type":"gene_name","search_mode":"full"}'
```

Pipe large JSON through `python -m json.tool` or `jq` to inspect, and slice out only what you need — `get_protein_full` payloads are large.

## Tools (HTTP endpoints)

| Tool | Method | Path | Use when |
|------|--------|------|----------|
| `get_protein_full` | GET | `/rest/{id}.json` | Whole annotation bundle for one protein (also `.txt`, `.fasta`) |
| `get_annotation` | GET | `/rest/{id}/{model}` | One layer only (lighter payload) |
| `get_region` | GET | `/rest/{id}/{start}-{end}.json` | Coordinates given (1-based inclusive) |
| `get_position` | GET | `/rest/{id}/{position}.json` | One residue / one missense change |
| `batch_analyze` | POST | `/api/v1/batch/analyze/` | Many proteins, regex/PSSM motif search, disorder filters, aggregated counts |
| `get_go_proteins` | GET | `/ajax/go-genes/?id={GO_ID}` | A GO term is mentioned |
| `get_ppi_neighborhood` | GET | `/ajax/ppi-proteins/?hub={GENE}` | Interaction partners of a hub |
| `get_statistics` | GET | `/statistics/api/` | Cohort percentages / distributions |
| `browse_dynamic` / `browse_precompiled` | GET | `/browse/dynamic/data/`, `/browse/precompiled/data/` | Filterable gene lists |
| `browse_roi_table` | GET | `/browse/roi/data/` | Rank degron/motif mutation burden across proteins |
| `variant_interpret` | POST | `/variant-interpretation/api/resolve-sequences/` | Explicit WT-vs-mutant, motif gain/loss, frameshift new C-tail, LLPS change |
| `get_bulk_download_manifest` | — | `/access_data` | User wants a genome-wide TSV (point them to the Downloads file category) |

Common `{model}` slugs for `get_annotation`: `protein`, `exon`, `phastcons`, `pfam`, `elm`, `elmswitches`, `ptm`, `mobidb`, `alphafold`, `iupred`, `anchor`, `aiupred-binding`, `tcgam`/`tcgaf`/`tcgai`, `cosmicm`/`cosmicf`/`cosmici`, `cbioportalm`/`cbioportalf`/`cbioportali`, `clinvar`, `omim`, `pathogenicity`, `pdb`, `roi`, `binding`, `dibs`, `mfib`, `phasepro`, `conservation`, `roisig`.

Full parameter detail (especially the `batch_analyze` request body — `discovery_method`, `find_region`, `motif_mode`, `regex_input`/`pssm_json`, `enforce_disorder_cutoff`, `island_pathogenicity`, `columns`) is in **[references/tools.md](references/tools.md)**. The model→table map is in **[references/schema.md](references/schema.md)**.

## Choosing tools (routing)

| Question pattern | Call in this order |
|------------------|--------------------|
| One gene, "where / how concentrated are mutations" | `get_protein_full` → `get_region` on candidate regions → optional `get_annotation` |
| Single amino-acid change (e.g. D32Y, P485L) | `get_position` → `variant_interpret` → `get_annotation` (`elm`/`pem`) |
| Custom coordinates / a named region | `get_region` → `get_annotation` (`phastcons`, `conservation`, …) |
| Disordered vs structured for a span | `get_region` → `get_annotation` (`alphafold`, `iupred`, `mobidb`) |
| Many genes, or regex/PSSM motif scan | `batch_analyze` |
| GO-term gene set | `get_go_proteins` → `batch_analyze` (with the returned accessions, `search_type: "gencode"`) |
| PPI partners of a hub | `get_ppi_neighborhood` → `batch_analyze` or `get_protein_full` × N |
| Proteome %, distribution, cohort stat | `get_statistics` |
| Filterable gene list (drivers + disorder + mutation thresholds) | `browse_dynamic` / `browse_precompiled` |
| Rank degron/motif mutation burden | `browse_roi_table` or `batch_analyze` (PEM + `tcgam` columns) |
| Genome-wide offline file | `get_bulk_download_manifest` (return the Downloads category name) |
| Deep ortholog MSA ribbon or Mol* 3D | No single REST tool — point the user to the Portal Summary page |

## Worked workflows (few-shot)

**[references/examples/](references/examples/)** holds 25 worked examples (`01`–`25`), each a real question with the exact endpoints, parameters, and the biological reasoning. **[references/examples/SUMMARY.md](references/examples/SUMMARY.md)** is the index — a table mapping each question to its tool sequence.

When a user's question resembles one of these patterns, **read the matching example file first** and follow its tool sequence and parameters rather than improvising. A few anchors:

- `02_ctnnb1_d32y_degron_loss.md` — single variant → degron (ELM) loss
- `03_slc2a1_p485l_motif_gain.md` — variant → *de novo* motif gain
- `05_siah_degron_regex_proteome.md` — proteome regex scan with disorder cutoff
- `09_siah1_ppi_disordered_partners.md` — PPI → batch disorder/PEM
- `11_driver_idr_mutation_fraction.md` — cohort statistic
- `20_pssm_batch_candidates.md` — PSSM matrix batch search
- `24_go_circadian_mutation_mix.md` — GO set → batch mutation mix

## Answering well

1. **Parse first.** Pull the gene/UniProt, any position or region, GO ID, regex/PSSM, or cohort from the message before choosing tools.
2. **Call in order, then synthesize from the JSON.** Cite concrete evidence: disorder fraction, mutation counts, ELM/PEM motif IDs, AlphaMissense class, conservation. Mechanism beats a lone pathogenicity score.
3. **Confirm isoform when it matters.** The main-isoform default may differ from a clinical report's transcript. Say so when comparing to external clinical data.
4. **Name the limits honestly.** This is not an ACMG/AMP diagnostic classifier. Motif gain/loss uses ELM class patterns — distinguish predicted vs curated. MSA ortholog ribbons and Mol* structure are UI-only; REST gives conservation vectors and pLDDT/RSA, not interactive alignments — direct the user to the Portal for those.
5. **Vectors are per-residue.** Disorder/pLDDT/conservation vectors are one value per residue, index-aligned to `Protein.sequence`.
