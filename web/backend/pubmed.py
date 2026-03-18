"""PubMed E-utilities client for fetching scientific papers."""

import asyncio
import logging
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import List, Optional
from urllib.parse import quote_plus

import httpx

logger = logging.getLogger(__name__)

ESEARCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
EFETCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"


@dataclass
class Paper:
    """A scientific paper from PubMed."""
    pmid: str = ""
    title: str = ""
    abstract: str = ""
    authors: List[str] = field(default_factory=list)
    journal: str = ""
    pub_date: str = ""
    doi: str = ""
    keywords: List[str] = field(default_factory=list)
    pub_types: List[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "pmid": self.pmid,
            "title": self.title,
            "abstract": self.abstract,
            "authors": self.authors,
            "journal": self.journal,
            "pub_date": self.pub_date,
            "doi": self.doi,
            "keywords": self.keywords,
            "pub_types": self.pub_types,
        }

    def citation(self) -> str:
        auth = self.authors[0] + " et al." if len(self.authors) > 1 else (self.authors[0] if self.authors else "Unknown")
        return f"{auth} ({self.pub_date}). {self.title}. {self.journal}. PMID: {self.pmid}"


async def search_pubmed(
    query: str,
    max_results: int = 10,
    days_back: int = 30,
) -> List[str]:
    """
    Search PubMed and return PMIDs for matching papers.

    Parameters
    ----------
    query : str
        Search query (field, topic, or research question)
    max_results : int
        Maximum number of results (1-20)
    days_back : int
        Only return papers from the last N days (1-180)

    Returns
    -------
    List[str]
        List of PubMed IDs
    """
    max_results = max(1, min(20, max_results))
    days_back = max(1, min(180, days_back))

    # Calculate date range
    end_date = datetime.now()
    start_date = end_date - timedelta(days=days_back)
    mindate = start_date.strftime("%Y/%m/%d")
    maxdate = end_date.strftime("%Y/%m/%d")

    params = {
        "db": "pubmed",
        "term": query,
        "retmax": str(max_results),
        "sort": "relevance",
        "datetype": "pdat",
        "mindate": mindate,
        "maxdate": maxdate,
        "retmode": "json",
    }

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(ESEARCH_URL, params=params)
        resp.raise_for_status()
        data = resp.json()

    result = data.get("esearchresult", {})
    pmids = result.get("idlist", [])

    logger.info(f"PubMed search '{query}' (last {days_back} days): found {len(pmids)} papers")
    return pmids


async def fetch_papers(pmids: List[str]) -> List[Paper]:
    """
    Fetch paper details from PubMed given a list of PMIDs.

    Parameters
    ----------
    pmids : List[str]
        List of PubMed IDs

    Returns
    -------
    List[Paper]
        List of Paper objects with full metadata
    """
    if not pmids:
        return []

    params = {
        "db": "pubmed",
        "id": ",".join(pmids),
        "rettype": "xml",
        "retmode": "xml",
    }

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.get(EFETCH_URL, params=params)
        resp.raise_for_status()

    papers = []
    try:
        root = ET.fromstring(resp.text)
        for article_elem in root.findall(".//PubmedArticle"):
            paper = _parse_article(article_elem)
            if paper:
                papers.append(paper)
    except ET.ParseError as e:
        logger.error(f"Failed to parse PubMed XML: {e}")

    logger.info(f"Fetched {len(papers)} paper details from PubMed")
    return papers


def _parse_article(elem: ET.Element) -> Optional[Paper]:
    """Parse a single PubmedArticle XML element."""
    try:
        medline = elem.find(".//MedlineCitation")
        if medline is None:
            return None

        pmid_elem = medline.find("PMID")
        pmid = pmid_elem.text if pmid_elem is not None else ""

        article = medline.find("Article")
        if article is None:
            return None

        # Title
        title_elem = article.find("ArticleTitle")
        title = "".join(title_elem.itertext()) if title_elem is not None else ""

        # Abstract
        abstract_parts = []
        abstract_elem = article.find("Abstract")
        if abstract_elem is not None:
            for text_elem in abstract_elem.findall("AbstractText"):
                label = text_elem.get("Label", "")
                text = "".join(text_elem.itertext())
                if label:
                    abstract_parts.append(f"{label}: {text}")
                else:
                    abstract_parts.append(text)
        abstract = "\n".join(abstract_parts)

        # Authors
        authors = []
        author_list = article.find("AuthorList")
        if author_list is not None:
            for author_elem in author_list.findall("Author"):
                last = author_elem.findtext("LastName", "")
                first = author_elem.findtext("ForeName", "")
                if last:
                    authors.append(f"{last} {first}".strip())

        # Journal
        journal_elem = article.find(".//Journal/Title")
        journal = journal_elem.text if journal_elem is not None else ""

        # Publication date
        pub_date_parts = []
        pub_date_elem = article.find(".//PubDate")
        if pub_date_elem is not None:
            year = pub_date_elem.findtext("Year", "")
            month = pub_date_elem.findtext("Month", "")
            day = pub_date_elem.findtext("Day", "")
            medline_date = pub_date_elem.findtext("MedlineDate", "")
            if year:
                pub_date_parts.append(year)
                if month:
                    pub_date_parts.append(month)
                if day:
                    pub_date_parts.append(day)
            elif medline_date:
                pub_date_parts.append(medline_date)
        pub_date = " ".join(pub_date_parts) if pub_date_parts else ""

        # DOI
        doi = ""
        for id_elem in elem.findall(".//ArticleId"):
            if id_elem.get("IdType") == "doi":
                doi = id_elem.text or ""
                break

        # Keywords
        keywords = []
        for kw_elem in medline.findall(".//KeywordList/Keyword"):
            if kw_elem.text:
                keywords.append(kw_elem.text)

        # Mesh terms as additional keywords
        for mesh_elem in medline.findall(".//MeshHeadingList/MeshHeading/DescriptorName"):
            if mesh_elem.text and mesh_elem.text not in keywords:
                keywords.append(mesh_elem.text)

        # Publication types
        pub_types = []
        for pt_elem in article.findall(".//PublicationTypeList/PublicationType"):
            if pt_elem.text:
                pub_types.append(pt_elem.text)

        return Paper(
            pmid=pmid,
            title=title,
            abstract=abstract,
            authors=authors,
            journal=journal,
            pub_date=pub_date,
            doi=doi,
            keywords=keywords,
            pub_types=pub_types,
        )
    except Exception as e:
        logger.warning(f"Failed to parse article: {e}")
        return None


async def search_and_fetch(
    query: str,
    max_results: int = 10,
    days_back: int = 30,
) -> List[Paper]:
    """Search PubMed and fetch full paper details in one call."""
    pmids = await search_pubmed(query, max_results, days_back)
    if not pmids:
        return []
    # Small delay to be polite to NCBI API
    await asyncio.sleep(0.5)
    return await fetch_papers(pmids)
