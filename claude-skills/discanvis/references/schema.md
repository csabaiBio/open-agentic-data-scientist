# DisCanVis database schema (AI chat reference)

DisCanVis2 stores preprocessed annotations in **PostgreSQL** via Django (`discanvis_server/models.py`). The chat agent does not query SQL directly; it uses **REST** and **JSON APIs** that read these tables.

## Core entity

### `Protein` (primary key: `accession`)

GENCODE-centric protein record: `gene_name`, `entry_uniprot`, `transcript_id`, `sequence`, `chromosome`, `main_isoform`, `cancer_driver`, canonical flags (`ensembl_canonical`, `mane_select`, `appris_principal_1`).

All per-protein annotations hang off `Protein` via foreign key or `protein_id` = accession.

---

## Annotation layers (per protein)

| Theme | Models | REST `model` slug (if exposed) |
|-------|--------|--------------------------------|
| Disorder | `IUPredscores`, `CombinedDisorder`, `MobiDBDisorder`, `CoiledCoils` | `iupred`, (in full JSON), `mobidb` |
| Structure | `PLLDTscores`, `RSAscores`, `PDBStructure`, `PDBRegional` | `alphafold`, `pdb` |
| Domains | `PFam` | `pfam` |
| Motifs | `Elm`, `PEM_Core_Motifs`, `Elm_Switches`, `ScanSite`, `ElmProteomeClassMatch` | `elm`, (PEM via full/batch), `elmswitches` |
| PTM | `PTM` | `ptm` |
| Binding / LLPS | `Binding`, `Binding_MFIB_Phasepro_Dibs` (DIBS, MFIB, PhasePro) | `binding`, `dibs`, `mfib`, `phasepro` |
| UniProt-like | `ROI`, `Site` | `roi`, `binding` |
| Conservation | `Conservation_phastCons`, `Conservation_multiple_level` | `phastcons`, `conservation` |
| Complexity | `ComplexitySeg`, `ComplexityDust`, `ComplexityTrf` | `complexity-*` |
| Genome | `Exonborders` | `exon` |
| Binding scores | `Anchorscores`, `AIUPredBindingscores` | `anchor`, `aiupred-binding` |
| Orthologs | `Insertion_Free_Alignment` | Summary UI / tables (not single REST slug) |

Vectors (`IUPredscores.vector`, `CombinedDisorder.combined_dis`, etc.) are **one character/score per residue**, aligned to `Protein.sequence`.

---

## Variants and clinical data

| Source | Models | REST slugs |
|--------|--------|------------|
| TCGA | `TCGAMissense`, `TCGAFrameshift`, `TCGAIndel` | `tcgam`, `tcgaf`, `tcgai` |
| COSMIC | `COSMICMissense`, … | `cosmicm`, `cosmicf`, `cosmici` |
| cBioPortal | `MutationMissense`, `MutationFrameshift`, `MutationIndel` | `cbioportalm`, `cbioportalf`, `cbioportali` |
| ClinVar | `ClinVar`, `ClinVarDisease` | `clinvar` |
| OMIM | `OMIMdisease`, `OMIM_Ontology` | `omim` |
| Polymorphism | `Polymorphism` | `polymorphism` |

Position-level REST (`/rest/{id}/{position}.json`) returns overlapping records for that amino acid.

---

## Pathogenicity

| Model | Content |
|-------|---------|
| `AlphaMissense` | Standalone per-residue score + class |
| `PathogenicityPredictors` | dbNSFP bundle: SIFT, ClinPred, Polyphen2, EVE, PrimateAI, VARITY, gMVP, AlphaMissense column, … |
| `PositionBasedAnnotations` | Aggregated position flags |

REST: `pathogenicity` layer on full protein, position, or region endpoints.

---

## Cancer drivers and ROIs

| Model | Role |
|-------|------|
| `DriverGenesCensus`, `DriverGenesCompendium` | Cancer Gene Census / Compendium flags on proteins |
| `Significantly_Mutated` | Cohort ROIs (significantly mutated regions) |

Browse tables and Statistics presets surface these without raw SQL.

---

## Network and ontology

| Model | Role |
|-------|------|
| `GO_Term` | GO term → gene/protein cache |
| `Interactions_Summary` | PPI edges for hub expansion |
| `AutocompleteGOTerm`, `AutocompleteDisease` | Search helpers |

API: `GET /ajax/go-genes/?id=GO:…`, `GET /ajax/ppi-proteins/?hub=GENE`.

---

## Precomputed browse / statistics (aggregated)

| Model | Role |
|-------|------|
| `BrowseProteinSummary`, `BrowseRegionSummary` | Dynamic search rows |
| `PrecomputedBrowseRegionRow`, `PrecomputedBrowseDriverRow` | Fast table slices |
| `ProteinSiteStatistic` | Site-level roll-ups |
| `Protein_Summary`, `Elm_Summary`, `Mobidb_Summary`, … | Layer-specific summaries |

API: `GET /browse/dynamic/data/`, `GET /browse/precompiled/data/`, `GET /statistics/api/`.

---

## Operations (not for end-user chat)

`DataIngestionStage`, `DataIngestionBatchRun`, `AnnotationCoverageBuild`, `ProteinAnnotationCoverage` — pipeline health only.

---

## Identifier resolution

`api.views.Utils.get_protein_by_id(id, search_type)`:

| `search_type` | Input example |
|---------------|---------------|
| (default) | GENCODE protein accession |
| `gene_name` | `CTNNB1` → main isoform when configured |
| `uniprot` | `P04637` |
| `transcript` | Ensembl transcript with version |

Always confirm **isoform** when comparing to external clinical reports.
