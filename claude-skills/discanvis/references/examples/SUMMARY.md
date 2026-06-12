# Example questions — summary index

Canonical workflows for the DisCanVis AI chat agent. Each row links to a detailed example with tool parameters and references.

**Tool names** match [../TOOLS.md](../TOOLS.md).

| # | Question | Answer (short) | Portal page | Tools (call in order) | Detail |
|---|----------|----------------|-------------|------------------------|--------|
| 1 | Where are pathogenic mutations concentrated in CTNNB1 (β-catenin)? Disordered vs structured? | Hotspots in **N-terminal IDR**; overlap with degrons and phosphosites | Summary (Visual Overview) | `get_protein_full` → `get_region` (N-term) → optional `get_annotation` (`clinvar`, `pem`, `ptm`) | [01](01_ctnnb1_mutation_hotspots.md) |
| 2 | Functional effect of **D32Y** in CTNNB1? | Loss of **DEG_SCF_TRCP1_1** phosphodegron → reduced degradation | Variant Interpretation | `get_position` (32) → `variant_interpret` (D32Y) → `get_annotation` (`elm`) | [02](02_ctnnb1_d32y_degron_loss.md) |
| 3 | Pathogenic mechanism of **SLC2A1 P485L**? | **De novo** motif **TRG_DiLeu_BaEn_1** (ELME000523) → localization / adaptin sorting | Variant Interpretation | `variant_interpret` (P485L) → `get_position` (485) → `get_annotation` (`pem`, `pathogenicity`) | [03](03_slc2a1_p485l_motif_gain.md) |
| 4 | AlphaMissense in disordered **FOXP2** — pathogenicity islands? | Island ~aa **449–457**; overlaps SIAH degron (PEM) | Summary (Pathogenicity) | `get_protein_full` → `get_region` (449–457) → `batch_analyze` (PEM + `island_pathogenicity`) | [04](04_foxp2_alphamissense_islands.md) |
| 5 | Proteome proteins with **`.[PAV]P[^P]`** SIAH degron pattern? | Many hits; filter by disorder fraction / mutation enrichment | Batch Analysis | `batch_analyze` (regex, disorder filter) — optional cohort `roi` from browse | [05](05_siah_degron_regex_proteome.md) |
| 6 | Diseases for mutations in disordered **LMOD3**? | **Nemaline myopathy** (e.g. R543L, L550F); WH2 motif overlap | Summary (Clinical / Visual) | `get_protein_full` → `get_region` (C-term) → `get_annotation` (`clinvar`, `pem`) | [06](06_lmod3_clinical_disorder.md) |
| 7 | Cancer **drivers** with **experimental** disorder? | TP53, MYC, BRCA1, … (Census + MobiDB) | Browse Tables | `browse_precompiled` or `browse_dynamic` (driver + MobiDB) → `get_protein_full` for finalists | [07](07_drivers_experimental_disorder.md) |
| 8 | Custom region **β-catenin 30–40**: conserved and disordered? | IDR + high **PhastCons** / MSA conservation (GSK3 site) | Summary (Custom View) | `get_region` (CTNNB1, 30–40) → `get_annotation` (`phastcons`, `conservation`) | [08](08_ctnnb1_custom_region_30_40.md) |
| 9 | **PPI partners** of SIAH1 that are disordered? | AFF2, AFF3, AFF4, FOXP2 — IDR + SIAH degron motifs | Batch / Browse | `get_ppi_neighborhood` (SIAH1) → `batch_analyze` (disorder fraction, PEM) | [09](09_siah1_ppi_disordered_partners.md) |
| 10 | **ATXN1** polyQ tract — structured or disordered? | AF2 helix vs IUPred/Combined disorder; MobiDB supports dynamic IDR | Summary (Visual) | `get_region` (polyQ span) → `get_annotation` (`alphafold`, `iupred`, `mobidb`) | [10](10_atxn1_polyq_structure_disorder.md) |
| 11 | **% cancer drivers** mutated through IDRs? | ~**21%** (cohort statistic) | Statistics | `get_statistics` (Cancer Gene Census preset) | [11](11_driver_idr_mutation_fraction.md) |
| 12 | Predictors for **SLC2A1 P485L** in IDR? | SIFT/Polyphen2/ClinPred benign; biological pathogenicity via motif gain | Summary (Pathogenicity compare) | `get_position` (485) → `get_annotation` (`pathogenicity`) → `variant_interpret` | [12](12_slc2a1_p485l_predictor_comparison.md) |
| 13 | TCGA missense in **WNK3** degron vs other degrons? | **6** missense in motif; 4th ranked degron burden | Browse Tables | `batch_analyze` (PEM DEG, `tcgam`) or `browse_roi_table` | [13](13_wnk3_degron_mutation_count.md) |
| 14 | **RAF1** 14-3-3 motif (S259) conserved? | Deep conservation in ortholog MSA + PhastCons | Summary (Orthologs) | `get_position` (259) → `get_region` (motif span) → `get_annotation` (`conservation`, `phastcons`) — MSA detail: portal | [14](14_raf1_14_3_3_conservation.md) |
| 15 | **VHL** cancer mutations near **exon** boundaries? | Many variants at exon edges → splicing hypothesis | Summary (Visual) | `get_protein_full` → `get_annotation` (`exon`, `tcgam`, `clinvar`) | [15](15_vhl_exon_boundary_mutations.md) |
| 16 | Download **PhasePro × TCGA** overlaps? | Pre-joined TSV on Downloads | Downloads | `get_bulk_download_manifest` (mutation × PhasePro) | [16](16_download_phasepro_tcga.md) |
| 17 | **TP53** N-term phosphosites mutated in cancer? | S15, S20, … overlap TCGA hotspots in N-terminal IDR | Summary (Visual) | `get_region` (N-term) → `get_annotation` (`ptm`, `tcgam`) | [17](17_tp53_phosphosite_cancer_overlap.md) |
| 18 | **PTEN** TCGA vs ClinVar landscapes? | Somatic scattered in domains; germline distinct hotspots | Summary (Clinical / Visual) | `get_protein_full` (compare `tcgam` vs `clinvar` tracks) | [18](18_pten_tcga_vs_clinvar.md) |
| 19 | **HMGB1** C-terminal frameshift consequences? | Acidic tail → basic tail; **LLPS** & **nucleolar dysfunction** | Variant Interpretation | `variant_interpret` (frameshift) → alignment · LLPS / nucleolar readout | [19](19_hmgb1_frameshift_cterminus.md) |
| 20 | **PSSM** search in 50 candidate proteins? | Batch accepts list + JSON/TSV matrix | Batch Analysis | `batch_analyze` (`motif_mode`: `pssm`, `pssm_json`) | [20](20_pssm_batch_candidates.md) |
| 21 | **FUS** mutation and **LLPS** / phase separation? | PhasePro scores shift WT vs mutant | Variant Interpretation / Summary | `variant_interpret` → `get_annotation` (`phasepro`) on affected region | [21](21_fus_llps_mutation.md) |
| 22 | **POLK** cancer mutations in IDR near motifs? | Hotspots at **PCNA (PIP)** and **REV1 (RIR)** motifs | Summary (Visual) | `get_protein_full` → `get_region` (IDR) → `get_annotation` (`pem`, `tcgam`) | [22](22_polK_disorder_motif_hotspots.md) |
| 23 | **AFF2/3/4** shared neurodevelopmental pathomechanism? | Shared **SIAH degron** in IDR; ClinVar clusters in PEM | Batch / Summary | `batch_analyze` (AFF2, AFF3, AFF4 + PEM + clinvar) | [23](23_aff2_aff3_aff4_shared_degron.md) |
| 24 | Genes for GO **circadian rhythm** + mutations? | GO gene list + disorder/mutation mix per protein | Browse / Batch | `get_go_proteins` → `batch_analyze` (full proteins, mutation/disorder columns) | [24](24_go_circadian_mutation_mix.md) |
| 25 | **EGFR** sequence, Pfam domains, annotation layout? | Extracellular + kinase domains; disordered C-tail with PTM/hotspots | Search → Summary | `get_protein_full` → `get_annotation` (`pfam`, `ptm`, `pdb`, `iupred`) | [25](25_egfr_domains_and_tail.md) |

## Agent checklist

1. Parse gene / position / GO / regex from the user message.
2. Look up the row above → open the linked example for parameters.
3. Call tools **in order**; synthesize answer from JSON (cite disorder fraction, counts, motif IDs).
4. If the question needs MSA ribbon or Mol*, state that interactive evidence is on the linked **Portal page**.
