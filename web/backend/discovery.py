"""Discovery pipeline - fetch papers, synthesize trends, formulate hypotheses."""

import asyncio
import json
import logging
from datetime import datetime
from typing import Any, AsyncGenerator, Callable, Dict, List, Optional

from .pubmed import Paper, search_and_fetch

logger = logging.getLogger(__name__)


def _now() -> str:
    return datetime.now().isoformat()


async def run_discovery(
    query: str,
    num_papers: int = 10,
    days_back: int = 30,
    model_config: Optional[Dict[str, Any]] = None,
    emit: Optional[Callable] = None,
) -> Dict:
    """
    Run the full discovery pipeline:
    1. Fetch papers from PubMed
    2. Synthesize findings via LLM
    3. Identify research gaps and formulate hypothesis
    4. Suggest datasets and analysis plan

    Parameters
    ----------
    query : str
        Research field or question
    num_papers : int
        Number of papers to fetch (1-20)
    days_back : int
        Look back period in days (1-180)
    emit : callable, optional
        Function to emit progress events: emit(type, content, metadata={})

    Returns
    -------
    Dict with keys: papers, synthesis, hypothesis, datasets, research_question
    """

    def _emit(event_type: str, content: str, metadata: Optional[Dict[str, Any]] = None):
        if emit:
            emit(event_type, content, metadata or {})

    result = {
        "papers": [],
        "synthesis": "",
        "hypothesis": "",
        "datasets": "",
        "research_question": "",
        "analysis_prompt": "",
    }

    planning_model_name: Optional[str] = None
    planning_provider: Optional[str] = None

    # ── Initialize LLM (needed for search term extraction + synthesis) ──
    try:
        from agentic_data_scientist.agents.adk.utils import (
            DEFAULT_MODEL_NAME,
            LLM_PROVIDER,
            create_litellm_model,
            create_litellm_model_from_config,
            resolve_model_name,
            resolve_provider_for_role,
        )

        if model_config:
            planning_model_name = resolve_model_name(model_config, role="planning")
            planning_provider = resolve_provider_for_role(model_config, role="planning")
            llm = create_litellm_model_from_config(model_config, role="planning", num_retries=3, timeout=120)
        else:
            planning_model_name = DEFAULT_MODEL_NAME
            planning_provider = LLM_PROVIDER
            llm = create_litellm_model(DEFAULT_MODEL_NAME, num_retries=3, timeout=120)
    except Exception as e:
        _emit("error", f"Failed to initialize LLM: {e}")
        result["synthesis"] = "LLM unavailable."
        return result

    # ── Phase 1: Fetch Papers ──────────────────────────────────────
    _emit("discovery_phase", "Generating optimised PubMed search terms...", {
        "phase": "searching", "phase_index": 0,
    })

    # Use LLM to extract multiple broader search queries
    search_queries = await _extract_search_terms(
        llm,
        query,
        model_name=planning_model_name,
        provider_override=planning_provider,
        emit=_emit,
    )
    _emit("discovery_phase",
          f"Trying {len(search_queries)} search strategies on PubMed...",
          {"phase": "searching", "phase_index": 0})

    papers: list[Paper] = []
    seen_pmids: set[str] = set()

    for sq in search_queries:
        if len(papers) >= num_papers:
            break
        try:
            batch = await search_and_fetch(sq, num_papers - len(papers), days_back)
            for p in batch:
                if p.pmid not in seen_pmids:
                    seen_pmids.add(p.pmid)
                    papers.append(p)
        except Exception as e:
            logger.warning(f"PubMed search failed for '{sq}': {e}")
            continue

    no_papers_found = len(papers) == 0

    if no_papers_found:
        _emit("discovery_phase",
              "No papers found on PubMed for any search strategy. "
              "Proceeding with AI reasoning based on existing knowledge.",
              {"phase": "no_results", "phase_index": 0})
    else:
        result["papers"] = [p.to_dict() for p in papers]

        _emit("discovery_phase", f"Found {len(papers)} papers from PubMed", {
            "phase": "papers_found", "phase_index": 1,
            "count": len(papers),
        })

        # Emit each paper as it's "processed"
        for i, paper in enumerate(papers):
            _emit("discovery_paper", paper.citation(), {
                "paper_index": i,
                "pmid": paper.pmid,
                "title": paper.title,
                "journal": paper.journal,
                "doi": paper.doi,
            })
            await asyncio.sleep(0.15)

    # ── Phase 2: Synthesize via LLM ───────────────────────────────
    _emit("discovery_phase", "Analyzing and synthesizing research findings...", {
        "phase": "synthesizing", "phase_index": 2,
    })

    papers_text = _format_papers_for_llm(papers) if papers else ""

    # Step 2a: Synthesis (with or without papers)
    if no_papers_found:
        synthesis = await _llm_call(llm, f"""You are a research synthesis expert. The user asked the following research question, but NO papers were found on PubMed matching it.

## User's Research Question:
{query}

## Instructions:
Using your own expert knowledge of the biomedical literature:

1. **Research Landscape** (2-3 paragraphs): Summarize the current state of knowledge about the key topics mentioned (genes, proteins, pathways, cell lines, phenotypes). Cite known facts and mechanisms.

2. **Key Known Findings** (bullet points): List 5-8 important known findings related to this question from your training data.

3. **Methodological Context**: What experimental and computational methods are typically used to study these topics?

4. **Why PubMed Returned No Results**: Briefly explain why the specific combination of terms may be too niche or novel for PubMed (e.g., very recent discovery, uncommon combination of gene + phenotype).

**Important**: Clearly state at the top that this synthesis is based on AI knowledge, not on specific retrieved papers. Be scientifically accurate and cite known genes, pathways, and mechanisms by name.""", model_name=planning_model_name, provider_override=planning_provider, emit=_emit)
    else:
        synthesis = await _llm_call(llm, f"""You are a research synthesis expert. Analyze these {len(papers)} recent scientific papers and provide a comprehensive synthesis.

## Papers:
{papers_text}

## Instructions:
1. **Research Landscape** (2-3 paragraphs): What is the current state of research in this area? What are the major themes, methodologies, and findings across these papers?

2. **Key Findings** (bullet points): List the 5-8 most important findings across all papers.

3. **Methodological Trends**: What analytical methods, datasets, and tools are being used?

4. **Emerging Patterns**: What patterns or trends do you see forming across these papers?

Be specific, cite paper PMIDs when referencing specific findings. Write in clear scientific prose.""", model_name=planning_model_name, provider_override=planning_provider, emit=_emit)

    result["synthesis"] = synthesis
    _emit("discovery_synthesis", synthesis, {"phase": "synthesis_complete", "phase_index": 3})

    await asyncio.sleep(0.3)

    # Step 2b: Research Gaps & Hypothesis
    _emit("discovery_phase", "Identifying research gaps and formulating hypothesis...", {
        "phase": "hypothesis", "phase_index": 4,
    })

    papers_context = f"\n## Original Papers:\n{papers_text}" if papers_text else f"\n## Original User Question:\n{query}\n\n(No PubMed papers were found — use your own knowledge)"

    hypothesis_response = await _llm_call(llm, f"""Based on this research synthesis, identify the most promising research gap and formulate a testable hypothesis.

## Research Synthesis:
{synthesis}
{papers_context}

## Instructions:
Provide your response in this exact format:

### Research Gaps
List 3-5 specific unanswered questions or underexplored areas in this field, based on what these papers reveal.

### Central Hypothesis
Formulate ONE clear, specific, testable hypothesis that:
- Addresses the most promising research gap
- Can be tested computationally with data analysis
- Would produce a novel, publishable result if confirmed
- Is specific enough to be falsifiable

State the hypothesis in standard scientific format: "We hypothesize that..."

### Required Datasets
List the specific types of datasets needed to test this hypothesis:
- What type of data (e.g., gene expression, clinical records, imaging)
- Suggested public sources (e.g., GEO, TCGA, UK Biobank)
- Minimum requirements (sample size, features, etc.)

### Proposed Analysis Plan
Outline 4-6 concrete analytical steps to test the hypothesis, including:
- Data preprocessing
- Statistical methods
- Machine learning approaches if applicable
- Validation strategy""", model_name=planning_model_name, provider_override=planning_provider, emit=_emit)

    # Parse the response into components
    result["hypothesis"] = hypothesis_response
    _emit("discovery_hypothesis", hypothesis_response, {
        "phase": "hypothesis_complete", "phase_index": 5,
    })

    await asyncio.sleep(0.3)

    # Step 2c: Generate the research question for the analysis agent
    _emit("discovery_phase", "Formulating research question for automated analysis...", {
        "phase": "formulating", "phase_index": 6,
    })

    research_question = await _llm_call(llm, f"""Based on the following hypothesis and analysis plan, write a clear, detailed research question and task description that an automated data scientist agent can execute.

## Hypothesis:
{hypothesis_response}

## Instructions:
Write a single, comprehensive prompt (3-5 paragraphs) that:
1. States the research question clearly
2. Describes what datasets to use and where to find them
3. Outlines the expected analysis pipeline
4. Specifies what outputs/results to produce (figures, statistical tests, reports)
5. Mentions what would constitute a novel, publishable finding

The prompt should be self-contained - an AI data scientist should be able to read it and know exactly what to do.
Do NOT include any preamble like "Here is the prompt" - just write the research task directly.""", model_name=planning_model_name, provider_override=planning_provider, emit=_emit)

    result["research_question"] = research_question
    result["analysis_prompt"] = research_question

    _emit("discovery_research_question", research_question, {
        "phase": "complete", "phase_index": 7,
    })

    _emit("discovery_phase", "Discovery complete! Ready to proceed with analysis.", {
        "phase": "done", "phase_index": 8,
    })

    return result


async def _extract_search_terms(
    llm,
    user_query: str,
    model_name: Optional[str] = None,
    provider_override: Optional[str] = None,
    emit: Optional[Callable] = None,
) -> List[str]:
    """Use the LLM to extract 3-5 PubMed search queries from a natural-language question.

    Returns queries ordered from most specific to broadest, each suitable for
    the PubMed search API (short keyword phrases, not full sentences).
    """
    prompt = f"""You are a PubMed search expert. Convert the following user research question into 4 PubMed search queries, ordered from most specific to broadest.

## User question:
{user_query}

## Rules:
- Each query should be SHORT keyword phrases suitable for PubMed (not full sentences).
- Use standard gene names, protein names, MeSH terms, and biological process terms.
- Query 1: Most specific — include the key gene/protein AND the specific phenotype/process.
- Query 2: Slightly broader — the gene/protein with the broader biological pathway.
- Query 3: Broader still — the biological process/phenotype without the specific gene.
- Query 4: Broadest — the general research area with common related terms.
- Do NOT include cell line names (e.g., RPE1, HeLa) — they are too restrictive.
- Do NOT use full sentences or questions as search terms.
- Use PubMed Boolean operators (AND, OR) where helpful.

## Output format:
Return ONLY the 4 search queries, one per line, no numbering, no explanation, no quotes.
"""
    raw = await _llm_call(llm, prompt, model_name=model_name, provider_override=provider_override, emit=emit)

    # Parse: one query per line, filter empties
    queries = [line.strip().strip('"').strip("'").strip('-').strip('1234567890.').strip()
               for line in raw.strip().splitlines()]
    queries = [q for q in queries if q and len(q) > 3 and len(q) < 200]

    if not queries:
        # Fallback: construct simple keyword queries from the original
        words = user_query.split()
        # Take key nouns (rough heuristic: words > 3 chars, not stopwords)
        stopwords = {'that', 'when', 'then', 'what', 'this', 'could', 'which', 'from',
                     'have', 'been', 'were', 'with', 'also', 'they', 'will', 'used',
                     'cell', 'lines', 'measured', 'image', 'would', 'after'}
        keywords = [w for w in words if len(w) > 3 and w.lower() not in stopwords]
        queries = [
            " ".join(keywords[:5]),
            " ".join(keywords[:3]),
            " ".join(keywords[:2]),
        ]

    logger.info(f"Extracted PubMed search queries: {queries}")
    return queries


def _format_papers_for_llm(papers: List[Paper], max_abstract_len: int = 800) -> str:
    """Format papers into a text block for the LLM."""
    parts = []
    for i, p in enumerate(papers, 1):
        abstract = p.abstract
        if len(abstract) > max_abstract_len:
            abstract = abstract[:max_abstract_len] + "..."

        keywords_str = ", ".join(p.keywords[:10]) if p.keywords else "N/A"

        parts.append(f"""### Paper {i} (PMID: {p.pmid})
**Title:** {p.title}
**Authors:** {', '.join(p.authors[:5])}{'...' if len(p.authors) > 5 else ''}
**Journal:** {p.journal} ({p.pub_date})
**Keywords:** {keywords_str}
**Abstract:** {abstract}
""")
    return "\n".join(parts)


async def _llm_call(
    llm,
    prompt: str,
    model_name: Optional[str] = None,
    provider_override: Optional[str] = None,
    emit: Optional[Callable] = None,
) -> str:
    """Make an LLM call using the LiteLlm API and return the text response."""
    try:
        from google.adk.models.llm_request import LlmRequest
        from google.genai import types as genai_types
        from agentic_data_scientist.agents.adk.utils import (
            DEFAULT_MODEL_NAME,
            LLM_PROVIDER,
            calculate_llm_cost,
        )

        config_kwargs = {
            "temperature": 0.3,
            "max_output_tokens": 4096,
        }
        resolved_provider = (provider_override or LLM_PROVIDER or "openai").lower()
        print("LLLM_PROVIDER:", resolved_provider)
        if resolved_provider not in ("bedrock", "anthropic"):
            config_kwargs["top_p"] = 0.95

        llm_request = LlmRequest(
            model=model_name or DEFAULT_MODEL_NAME,
            contents=[genai_types.Content(
                role="user",
                parts=[genai_types.Part(text=prompt)],
            )],
            config=genai_types.GenerateContentConfig(**config_kwargs),
        )

        response = None
        async for llm_response in llm.generate_content_async(llm_request=llm_request, stream=False):
            response = llm_response
            break

        if response and getattr(response, "usage_metadata", None):
            usage = response.usage_metadata
            prompt_tokens = usage.prompt_token_count or 0
            cached_input_tokens = usage.cached_content_token_count or 0
            output_tokens = usage.candidates_token_count or 0
            total_tokens = usage.total_token_count or (prompt_tokens + output_tokens)
            resolved_model = model_name or DEFAULT_MODEL_NAME
            cost_usd = calculate_llm_cost(
                model_name=resolved_model,
                prompt_tokens=prompt_tokens,
                completion_tokens=output_tokens,
                provider_override=resolved_provider,
                cached_tokens=cached_input_tokens,
                call_type="generate_content",
            )
            if emit:
                emit(
                    "usage",
                    resolved_model,
                    {
                        "model": resolved_model,
                        "provider": resolved_provider,
                        "cost_usd": cost_usd,
                        "usage": {
                            "prompt_tokens": prompt_tokens,
                            "cached_input_tokens": cached_input_tokens,
                            "output_tokens": output_tokens,
                            "total_tokens": total_tokens,
                        },
                    },
                )

        if response and response.content and response.content.parts:
            for part in response.content.parts:
                if hasattr(part, "text") and part.text:
                    return part.text

        return "(No response from LLM)"

    except Exception as e:
        logger.exception("LLM call failed")
        return f"(LLM call failed: {e})"
