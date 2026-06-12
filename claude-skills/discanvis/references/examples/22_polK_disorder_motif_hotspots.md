# Example 22 — POLK disordered region cancer mutations at motifs

## Question

What is the structural explanation for cancer mutations in the disordered regions of the POLK DNA polymerase?

## Answer

Somatic hotspots in POLK **IDRs** coincide with predicted **PCNA-binding (PIP-box)** and **REV1-interacting (RIR)** motifs (PEM/ELM), suggesting disruption of **translesion synthesis (TLS)** complex assembly rather than catalytic domain damage.

## Portal page

**Summary → Visual Overview**.

## Tools (in order)

### 1. `get_protein_full`

```http
GET /rest/POLK.json?search_type=gene_name
```

### 2. `get_region` (IDR segments with high disorder)

Identify intervals where `CombinedDisorder` exceeds threshold, then:

```http
GET /rest/POLK/{idr_start}-{idr_end}.json?search_type=gene_name
```

### 3. `get_annotation`

```http
GET /rest/POLK/pem?search_type=gene_name
GET /rest/POLK/tcgam?search_type=gene_name
```

## Supplementary notes

- POLK (DNA polymerase kappa) TLS role links motif disruption to mutagenesis phenotypes.
- Cross-check **Pfam** polymerase domain vs IDR tail boundaries.
- **References:** [../../README_CAPABILITIES.md](../../README_CAPABILITIES.md) §2.1; [../TOOLS.md](../TOOLS.md) §1–3.
