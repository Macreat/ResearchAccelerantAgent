/**
 * Academic Search Service
 * Integrates with Semantic Scholar and OpenAlex APIs
 * to retrieve paper metadata, citations, and abstracts.
 */

// ============================================================================
// Types
// ============================================================================
export interface PaperMetadata {
  externalId: string;
  source: string;
  title: string;
  authors: string[];
  year: number;
  journal?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  doi?: string;
  url: string;
  abstract?: string;
  citationCount: number;
  citationCountSource: string;
  pdfUrl?: string;
  relevanceScore: number;
}

export interface SearchParams {
  topic: string;
  keywords?: string;
  yearFrom: number;
  yearTo: number;
  citationMin: number;
  numStudies: number;
  databases: string[];
  inclusionCriteria?: string;
  exclusionCriteria?: string;
}

// ============================================================================
// Semantic Scholar API
// ============================================================================
const SS_BASE_URL = "https://api.semanticscholar.org/graph/v1";

async function searchSemanticScholar(params: SearchParams): Promise<PaperMetadata[]> {
  const query = params.keywords || params.topic;
  const fields = [
    "paperId",
    "title",
    "authors",
    "year",
    "journal",
    "volume",
    "pages",
    "doi",
    "abstract",
    "citationCount",
    "openAccessPdf",
    "url",
  ].join(",");

  const url = new URL(`${SS_BASE_URL}/paper/search`);
  url.searchParams.set("query", query);
  url.searchParams.set("fields", fields);
  url.searchParams.set("limit", String(Math.min(params.numStudies * 3, 100)));
  url.searchParams.set("publicationDateOrYear", `${params.yearFrom}:${params.yearTo}`);

  // Only 1 attempt for Semantic Scholar (they're aggressive with 429)
  // If rate limited once, skip to SerpAPI
  try {
    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": "ResearchAccelerant/1.0",
      },
    });

    if (response.status === 429) {
      // Don't retry, just skip
      console.warn("Semantic Scholar rate limited (429). Use SerpAPI for better results.");
      return [];
    }

    if (!response.ok) {
      console.warn(`Semantic Scholar API error: ${response.status}`);
      return [];
    }

    const data = await response.json() as {
      data?: Array<{
        paperId: string;
        title: string;
        authors: Array<{ name: string }>;
        year: number;
        journal?: { name: string; volume?: string; pages?: string };
        volume?: string;
        pages?: string;
        doi?: string;
        abstract?: string;
        citationCount?: number;
        openAccessPdf?: { url: string };
        url?: string;
      }>;
    };

    if (!data.data) return [];

    return data.data
      .filter((p) => (p.citationCount || 0) >= params.citationMin)
      .map((p) => ({
        externalId: p.paperId,
        source: "semantic_scholar",
        title: p.title,
        authors: p.authors.map((a) => a.name),
        year: p.year,
        journal: p.journal?.name,
        volume: p.journal?.volume || p.volume,
        pages: p.journal?.pages || p.pages,
        doi: p.doi,
        url: p.url || `https://www.semanticscholar.org/paper/${p.paperId}`,
        abstract: p.abstract,
        citationCount: p.citationCount || 0,
        citationCountSource: "Semantic Scholar",
        pdfUrl: p.openAccessPdf?.url,
        relevanceScore: 0,
      }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Semantic Scholar search failed:", message);
    return [];
  }
}

// ============================================================================
// SerpAPI - Google Scholar Integration
// ============================================================================
const SERPAPI_BASE_URL = "https://serpapi.com/search";

import { env } from "../lib/env";

async function searchSerpAPI(params: SearchParams): Promise<PaperMetadata[]> {
  const apiKey = env.serpapiKey || "551515deab6e76ef6d83d4c6db09911679d49e1781e39643552f48a6f78c3082";
  
  if (!apiKey) {
    console.warn("[SerpAPI] Key not configured, skipping Google Scholar search");
    return [];
  }

  // Try searching with keywords first, then fallback to topic if no results
  const searchQueries = [];
  if (params.keywords && params.keywords.trim()) {
    searchQueries.push({ q: params.keywords, type: "keywords" });
  }
  searchQueries.push({ q: params.topic, type: "topic" });

  for (const { q, type } of searchQueries) {
    console.log(`[SerpAPI] Attempting ${type} search: "${q}" (Years: ${params.yearFrom}-${params.yearTo})`);

    const url = new URL(SERPAPI_BASE_URL);
    url.searchParams.set("q", q);
    url.searchParams.set("engine", "google_scholar");
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("num", "20"); 
    url.searchParams.set("as_ylo", String(params.yearFrom));
    url.searchParams.set("as_yhi", String(params.yearTo));
    url.searchParams.set("hl", "en");

    try {
      const response = await fetch(url.toString(), {
        headers: {
          Accept: "application/json",
          "User-Agent": "ResearchAccelerant/1.0",
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          console.error("[SerpAPI] Authentication failed - check API key");
        } else {
          console.error(`[SerpAPI] API error: ${response.status}`);
        }
        continue; // Try next query if available
      }

      const data = await response.json() as {
        organic_results?: Array<{
          position: number;
          title: string;
          link: string;
          snippet: string;
          publication_info?: {
            summary: string;
          };
          resources?: Array<{ title: string; link: string; file_format?: string }>;
          inline_links?: {
            cited_by?: { total: number };
          };
        }>;
      };

      if (!data.organic_results || data.organic_results.length === 0) {
        console.warn(`[SerpAPI] No results for ${type} search, trying fallback if available...`);
        continue;
      }

      console.log(`[SerpAPI] Found ${data.organic_results.length} results using ${type} search`);

      return data.organic_results
        .slice(0, params.numStudies * 3)
        .map((result, idx) => {
          const citationInfo = result.publication_info?.summary || "";
          const citedByMatch = result.inline_links?.cited_by?.total || 0;
          
          const pdfResource = result.resources?.find(
            (r) => r.file_format === "PDF" || r.title?.toLowerCase().includes("pdf")
          );

          return {
            externalId: `serpapi_${idx}_${Date.now()}`,
            source: "google_scholar",
            title: result.title,
            authors: extractAuthorsFromSummary(citationInfo),
            year: extractYearFromSummary(citationInfo),
            journal: extractJournalFromSummary(citationInfo),
            url: result.link || "",
            abstract: result.snippet || "",
            citationCount: citedByMatch,
            citationCountSource: "Google Scholar",
            pdfUrl: pdfResource?.link,
            relevanceScore: 100 - (result.position || 0) * 2,
          };
        });
    } catch (error) {
      console.error(`[SerpAPI] Search failed for ${type}:`, error);
    }
  }

  return [];
}

function extractAuthorsFromSummary(summary: string): string[] {
  if (!summary) return [];
  const parts = summary.split(" - ");
  if (parts.length > 0) {
    const authorString = parts[0];
    return authorString.split(",").map((a) => a.trim()).filter((a) => a.length > 0);
  }
  return [];
}

function extractYearFromSummary(summary: string): number {
  const yearMatch = summary.match(/(\d{4})/);
  return yearMatch ? parseInt(yearMatch[1], 10) : new Date().getFullYear();
}

function extractJournalFromSummary(summary: string): string | undefined {
  const parts = summary.split(" - ");
  if (parts.length > 1) {
    return parts[1].split(",")[0]?.trim();
  }
  return undefined;
}

// ============================================================================
// OpenAlex API
// ============================================================================
const OA_BASE_URL = "https://api.openalex.org";

async function searchOpenAlex(params: SearchParams): Promise<PaperMetadata[]> {
  const query = params.keywords || params.topic;

  try {
    // Use simpler query format to avoid 400 errors
    const url = new URL(`${OA_BASE_URL}/works`);
    
    // Basic search without complex filters first
    url.searchParams.set("search", query);
    url.searchParams.set("per-page", String(Math.min(params.numStudies * 3, 50)));
    url.searchParams.set("sort", "cited_by_count:desc");

    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": "ResearchAccelerant/1.0 (mailto:research@example.com)",
      },
    });

    if (!response.ok) {
      console.warn(`OpenAlex API error: ${response.status} - ${response.statusText}`);
      return [];
    }

    const data = await response.json() as {
      results?: Array<{
        id: string;
        display_name: string;
        authorships?: Array<{ author: { display_name: string } }>;
        publication_year: number;
        host_venue?: { display_name: string; url?: string };
        biblio?: { volume?: string; issue?: string; first_page?: string; last_page?: string };
        doi?: string;
        abstract?: string;
        cited_by_count?: number;
        open_access?: { is_oa: boolean; oa_url?: string };
      }>;
    };

    if (!data.results) return [];

    return data.results
      .filter((p) => {
        // Filter by year range and citation min
        if (p.publication_year < params.yearFrom || p.publication_year > params.yearTo) return false;
        if ((p.cited_by_count || 0) < params.citationMin) return false;
        return true;
      })
      .map((p) => ({
        externalId: p.id,
        source: "openalex",
        title: p.display_name,
        authors: (p.authorships || []).map((a) => a.author.display_name),
        year: p.publication_year,
        journal: p.host_venue?.display_name,
        volume: p.biblio?.volume,
        issue: p.biblio?.issue,
        pages: p.biblio?.first_page
          ? `${p.biblio.first_page}-${p.biblio.last_page || ""}`
          : undefined,
        doi: p.doi,
        url: p.host_venue?.url || p.doi || p.id,
        abstract: p.abstract,
        citationCount: p.cited_by_count || 0,
        citationCountSource: "OpenAlex",
        pdfUrl: p.open_access?.oa_url,
        relevanceScore: 0,
      }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("OpenAlex search failed:", message);
    return [];
  }
}

// ============================================================================
// Main Search Orchestrator (Sequential with fallback)
// ============================================================================
export async function searchPapers(params: SearchParams): Promise<PaperMetadata[]> {
  const databases = params.databases.length > 0 ? params.databases : ["google_scholar"];
  const allResults: PaperMetadata[] = [];

  // Try SerpAPI first (most reliable, no rate limiting issues)
  if (databases.includes("google_scholar") || databases.includes("serpapi")) {
    console.log("Searching Google Scholar (SerpAPI)...");
    const serpResults = await searchSerpAPI(params);
    if (serpResults.length > 0) {
      allResults.push(...serpResults);
      console.log(`✓ Google Scholar returned ${serpResults.length} results`);
    }
  }

  // Return early if we have enough results from SerpAPI
  if (allResults.length >= params.numStudies) {
    console.log(`✓ Sufficient results (${allResults.length}), skipping other databases`);
    return allResults.slice(0, params.numStudies);
  }

  // Try Semantic Scholar only if we need more results and it's not rate limited
  if (databases.includes("semantic_scholar") && allResults.length < params.numStudies) {
    console.log("Searching Semantic Scholar (may be rate limited for niche topics)...");
    try {
      const ssResults = await searchSemanticScholarSafe(params);
      allResults.push(...ssResults);
      console.log(`✓ Semantic Scholar returned ${ssResults.length} results`);
    } catch (error) {
      console.warn("Semantic Scholar skipped due to rate limiting or errors");
    }
  }

  // Try OpenAlex only if we still need more results
  if (databases.includes("openalex") && allResults.length < params.numStudies) {
    console.log("Searching OpenAlex...");
    try {
      const oaResults = await searchOpenAlex(params);
      allResults.push(...oaResults);
      console.log(`✓ OpenAlex returned ${oaResults.length} results`);
    } catch (error) {
      console.warn("OpenAlex search failed");
    }
  }

  // Deduplicate by DOI or title similarity
  const seen = new Set<string>();
  const deduplicated: PaperMetadata[] = [];

  for (const paper of allResults) {
    const key = paper.doi || paper.title.toLowerCase().trim();
    if (!seen.has(key)) {
      seen.add(key);
      deduplicated.push(paper);
    }
  }

  // Sort by citation count (descending) then year (descending)
  deduplicated.sort((a, b) => {
    if (b.citationCount !== a.citationCount) return b.citationCount - a.citationCount;
    return b.year - a.year;
  });

  // Return top N results
  return deduplicated.slice(0, params.numStudies);
}

// Safe wrapper for Semantic Scholar that doesn't spam retries
async function searchSemanticScholarSafe(params: SearchParams): Promise<PaperMetadata[]> {
  try {
    return await searchSemanticScholar(params);
  } catch {
    return [];
  }
}

// ============================================================================
// Paper Enrichment - Get full details for a paper
// ============================================================================
export async function enrichPaperDetails(paperId: string, source: string): Promise<Partial<PaperMetadata>> {
  if (source === "semantic_scholar") {
    try {
      const response = await fetch(
        `${SS_BASE_URL}/paper/${paperId}?fields=abstract,tldr,fieldsOfStudy`,
        { headers: { Accept: "application/json" } }
      );
      if (!response.ok) return {};
      const data = await response.json() as {
        abstract?: string;
        tldr?: { text?: string };
        fieldsOfStudy?: string[];
      };
      return {
        abstract: data.abstract || data.tldr?.text,
      };
    } catch {
      return {};
    }
  }
  return {};
}
