/**
 * Advanced Research Pipeline Service
 * 
 * Features:
 * - Semantic search on local PDFs with Ollama embeddings
 * - Deep PDF content extraction and analysis
 * - Relevance scoring with multiple factors
 * - Citation formatting (APA, IEEE, MLA, BibTeX)
 * - Hybrid search (local docs + external APIs fallback)
 * - Keyword expansion for niche topics
 */

import { env } from "../lib/env";
import { listDocuments, searchDocuments } from "./local-docs";
import { searchPapers } from "./academic-search";

// ============================================================================
// Types
// ============================================================================

export interface ResearchQuery {
  topic: string;
  keywords: string[];
  yearFrom: number;
  yearTo: number;
  citationMin: number;
  bibFormat: "APA" | "IEEE" | "MLA" | "BibTeX";
  searchStrategy: "local" | "hybrid" | "external";
  returnCount: number;
  includeLocalDocs: boolean;
  includeExternalAPIs: boolean;
}

export interface Embedding {
  id: string;
  text: string;
  vector: number[];
  score?: number;
}

export interface RankedPaper {
  id: string;
  title: string;
  authors: string[];
  year: number;
  abstract: string;
  journal?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  doi?: string;
  url: string;
  citations: number;
  source: "local" | "semantic_scholar" | "google_scholar" | "openalex";
  relevanceScore: number; // 0-100
  keywordMatches: string[];
  metadata?: {
    pdfPath?: string;
    extractedContent?: string;
    keywords?: string[];
  };
}

export interface ResearchResult {
  query: ResearchQuery;
  totalPapersFound: number;
  papers: RankedPaper[];
  searchDuration: number;
  source: string;
  warnings: string[];
}

// ============================================================================
// Ollama Embeddings
// ============================================================================

export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    if (!env.enableLocalLlm) {
      console.warn("Ollama disabled, returning zero vector");
      return new Array(384).fill(0);
    }

    const response = await fetch(`${env.ollamaUrl}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OLLAMA_MODEL || "llama3.1",
        input: text,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.warn(`Ollama embed failed: ${response.status}`);
      return new Array(384).fill(0);
    }

    const data = await response.json() as { embeddings?: number[][] };
    return data.embeddings?.[0] || new Array(384).fill(0);
  } catch (error) {
    console.error("Embedding generation failed:", error);
    return new Array(384).fill(0);
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

// ============================================================================
// Local Document Search
// ============================================================================

export async function searchLocalDocuments(query: ResearchQuery): Promise<RankedPaper[]> {
  const localDocs = listDocuments();
  if (localDocs.length === 0) {
    return [];
  }

  // Get simple keyword matches first
  const searchQuery = [query.topic, ...query.keywords].join(" ");
  const keywordMatches = searchDocuments(searchQuery);

  // Score each document by relevance
  const scored: Array<{ doc: typeof localDocs[0]; score: number }> = [];
  const queryEmbedding = await generateEmbedding(searchQuery);

  for (const doc of keywordMatches) {
    const docEmbedding = await generateEmbedding(doc.title + " " + doc.snippet);
    const semanticScore = cosineSimilarity(queryEmbedding, docEmbedding) * 100;
    
    // Boost by keyword matches in filename
    let keywordScore = 0;
    for (const kw of query.keywords) {
      if (doc.fileName.toLowerCase().includes(kw.toLowerCase())) {
        keywordScore += 20;
      }
      if (doc.title.toLowerCase().includes(kw.toLowerCase())) {
        keywordScore += 15;
      }
    }

    const totalScore = Math.min(100, (semanticScore * 0.6 + keywordScore * 0.4));
    if (totalScore > 20) { // Only include documents with >20% relevance
      scored.push({ doc, score: totalScore });
    }
  }

  // Sort by score and convert to RankedPaper format
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, query.returnCount)
    .map((item) => ({
      id: item.doc.sha256,
      title: item.doc.title,
      authors: ["Local Document"],
      year: item.doc.indexedAt.getFullYear(),
      abstract: item.doc.snippet,
      url: `local://${item.doc.relativePath}`,
      citations: 0,
      source: "local",
      relevanceScore: Math.round(item.score),
      keywordMatches: query.keywords.filter((kw) =>
        item.doc.title.toLowerCase().includes(kw.toLowerCase()) ||
        item.doc.fileName.toLowerCase().includes(kw.toLowerCase())
      ),
      metadata: {
        pdfPath: item.doc.absolutePath,
      },
    }));
}

// ============================================================================
// External API Search
// ============================================================================

export async function searchExternalAPIs(query: ResearchQuery): Promise<RankedPaper[]> {
  try {
    // Join keywords with OR to broaden the search for external APIs
    const searchQuery = query.keywords.join(" OR ");
    console.log(`[ResearchPipeline] Executing external search for: ${searchQuery}`);

    const results = await searchPapers({
      topic: query.topic,
      keywords: searchQuery,
      yearFrom: query.yearFrom,
      yearTo: query.yearTo,
      citationMin: query.citationMin,
      numStudies: query.returnCount,
      databases: ["google_scholar", "semantic_scholar", "openalex"],
    });

    return results.map((paper) => ({
      id: paper.externalId,
      title: paper.title,
      authors: paper.authors,
      year: paper.year,
      abstract: paper.abstract || "",
      journal: paper.journal,
      volume: paper.volume,
      issue: paper.issue,
      pages: paper.pages,
      doi: paper.doi,
      url: paper.url,
      citations: paper.citationCount,
      source: (paper.source as "semantic_scholar" | "google_scholar" | "openalex") || "semantic_scholar",
      relevanceScore: paper.relevanceScore,
      keywordMatches: query.keywords.filter((kw) =>
        paper.title.toLowerCase().includes(kw.toLowerCase()) ||
        (paper.abstract?.toLowerCase().includes(kw.toLowerCase()) ?? false)
      ),
    }));
  } catch (error) {
    console.error("External API search failed:", error);
    return [];
  }
}

// ============================================================================
// Keyword Expansion (for niche topics)
// ============================================================================

export async function expandKeywords(topic: string, keywords: string[]): Promise<string[]> {
  const thesaurus: Record<string, string[]> = {
    // VHF Monitoring
    vhf: ["VHF", "VHF band", "very high frequency", "spectrum monitoring"],
    anomaly: ["anomaly", "anomalies", "anomalous", "abnormal", "deviation", "outlier"],
    detection: ["detection", "detection system", "detector", "identifying", "recognition"],
    monitoring: ["monitoring", "monitor", "surveillance", "observation", "tracking"],
    spectrum: ["spectrum", "spectral", "frequency analysis", "RF", "radio frequency"],
    
    // Microservices
    microservices: ["microservices", "microservice", "service-oriented", "SOA"],
    architecture: ["architecture", "architectural", "design", "system design"],
    distributed: ["distributed", "distribution", "decentralized", "cloud-native"],
    
    // Machine Learning
    "machine learning": ["machine learning", "ML", "deep learning", "neural network", "AI"],
    signal: ["signal", "signal processing", "DSP", "digital signal"],
    "real-time": ["real-time", "realtime", "streaming", "online processing"],
  };

  let expanded = [...keywords];

  for (const [key, synonyms] of Object.entries(thesaurus)) {
    const keyLower = key.toLowerCase();
    const topicLower = topic.toLowerCase();
    
    if (topicLower.includes(keyLower) || keywords.some((k) => k.toLowerCase().includes(keyLower))) {
      expanded = [...new Set([...expanded, ...synonyms])];
    }
  }

  return expanded.slice(0, 15); // Limit to 15 keywords to avoid noise
}

// ============================================================================
// Relevance Scoring
// ============================================================================

export function scoreRelevance(
  paper: RankedPaper,
  query: ResearchQuery,
  allPapers: RankedPaper[]
): number {
  let score = paper.relevanceScore; // Base score from search

  // Keyword match boost (20% weight)
  const keywordBoost = (paper.keywordMatches.length / Math.max(query.keywords.length, 1)) * 20;
  score += keywordBoost;

  // Recency boost for local docs (10% weight)
  if (paper.source === "local") {
    const age = new Date().getFullYear() - paper.year;
    const recencyBoost = Math.max(0, 10 - age * 0.5);
    score += recencyBoost;
  }

  // Citation boost for external papers (10% weight)
  if (paper.source !== "local" && paper.citations > 0) {
    const maxCitations = Math.max(...allPapers.map((p) => p.citations), 1);
    const citationBoost = (paper.citations / maxCitations) * 10;
    score += citationBoost;
  }

  return Math.min(100, score);
}

// ============================================================================
// Citation Formatting
// ============================================================================

export function formatCitation(paper: RankedPaper, format: ResearchQuery["bibFormat"]): string {
  const authorsStr = paper.authors.slice(0, 3).join(", ") +
    (paper.authors.length > 3 ? ", et al." : "");

  switch (format) {
    case "APA":
      return formatAPA(paper, authorsStr);
    case "IEEE":
      return formatIEEE(paper, authorsStr);
    case "MLA":
      return formatMLA(paper, authorsStr);
    case "BibTeX":
      return formatBibTeX(paper);
    default:
      return formatAPA(paper, authorsStr);
  }
}

function formatAPA(paper: RankedPaper, authorsStr: string): string {
  const venue = paper.journal || "Conference Proceedings";
  const doiPart = paper.doi ? ` https://doi.org/${paper.doi}` : "";
  return `${authorsStr} (${paper.year}). ${paper.title}. ${venue}${doiPart}`;
}

function formatIEEE(paper: RankedPaper, authorsStr: string): string {
  const venue = paper.journal || "Proceedings";
  const pagePart = paper.pages ? `, pp. ${paper.pages}` : "";
  return `[1] ${authorsStr}, "${paper.title}," ${venue}${pagePart}, ${paper.year}.`;
}

function formatMLA(paper: RankedPaper, authorsStr: string): string {
  const venue = paper.journal || "Conference";
  const pagePart = paper.pages ? `: ${paper.pages}` : "";
  return `${authorsStr}. "${paper.title}." ${venue}, ${paper.year}${pagePart}.`;
}

function formatBibTeX(paper: RankedPaper): string {
  const key = paper.title
    .substring(0, 20)
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
  const authors = paper.authors.join(" and ");
  return `@article{${key}${paper.year},
  title={${paper.title}},
  author={${authors}},
  year={${paper.year}},
  journal={${paper.journal || "Unknown"}}
}`;
}

// ============================================================================
// Hybrid Search Pipeline
// ============================================================================

export async function executeHybridSearch(query: ResearchQuery): Promise<ResearchResult> {
  const startTime = Date.now();
  const warnings: string[] = [];

  // Step 1: Search local documents
  let papers: RankedPaper[] = [];
  if (query.includeLocalDocs) {
    const localPapers = await searchLocalDocuments(query);
    papers.push(...localPapers);
  }

  // Step 2: If not enough papers, search external APIs
  if (papers.length < query.returnCount && query.includeExternalAPIs) {
    try {
      const externalPapers = await searchExternalAPIs(query);
      papers.push(...externalPapers);
    } catch (error) {
      warnings.push(`External search failed: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  // Step 3: If still not enough, expand keywords and retry
  if (papers.length < 3 && query.keywords.length < 10) {
    warnings.push("Insufficient results, expanding keywords...");
    const expandedKeywords = await expandKeywords(query.topic, query.keywords);
    const expandedQuery: ResearchQuery = {
      ...query,
      keywords: expandedKeywords,
    };
    const retryPapers = await searchExternalAPIs(expandedQuery);
    papers.push(...retryPapers);
  }

  // Step 4: Deduplicate and rank
  const uniquePapers = deduplicatePapers(papers);
  uniquePapers.forEach((paper) => {
    paper.relevanceScore = scoreRelevance(paper, query, uniquePapers);
  });

  // Step 5: Sort by relevance and limit
  const rankedPapers = uniquePapers
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, query.returnCount);

  const duration = Date.now() - startTime;

  return {
    query,
    totalPapersFound: rankedPapers.length,
    papers: rankedPapers,
    searchDuration: duration,
    source: "hybrid",
    warnings,
  };
}

function deduplicatePapers(papers: RankedPaper[]): RankedPaper[] {
  const seen = new Set<string>();
  const unique: RankedPaper[] = [];

  for (const paper of papers) {
    // Normalize title for comparison
    const normalizedTitle = paper.title.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!seen.has(normalizedTitle)) {
      seen.add(normalizedTitle);
      unique.push(paper);
    }
  }

  return unique;
}

// ============================================================================
// Bibliography Generation
// ============================================================================

export function generateBibliography(papers: RankedPaper[], format: ResearchQuery["bibFormat"]): string {
  const citations = papers.map((paper, idx) => {
    const number = format === "IEEE" ? `[${idx + 1}]` : "";
    const citation = formatCitation(paper, format);
    return number ? `${number} ${citation}` : citation;
  });

  return citations.join("\n\n");
}

// ============================================================================
// Specialized Topic Pipelines
// ============================================================================

export async function createVHFMonitoringPipeline(): Promise<ResearchQuery> {
  return {
    topic: "VHF Monitoring and RF Anomaly Detection using Machine Learning",
    keywords: [
      "aviation VHF communications",
      "RF spectrum monitoring SDR",
      "machine learning signal interruption",
      "spectrogram segmentation LDNet",
      "interference classification ACI CCI",
      "SDR raspberry pi monitoring",
    ],
    yearFrom: 2015,
    yearTo: 2026,
    citationMin: 0,
    bibFormat: "APA",
    searchStrategy: "hybrid",
    returnCount: 10,
    includeLocalDocs: true,
    includeExternalAPIs: true,
  };
}

// ============================================================================
// Main API
// ============================================================================

export async function performAdvancedSearch(
  query: Partial<ResearchQuery> = {}
): Promise<ResearchResult> {
  // Use VHF topic as default if not specified
  const defaultQuery = await createVHFMonitoringPipeline();
  const finalQuery: ResearchQuery = {
    ...defaultQuery,
    ...query,
  };

  return executeHybridSearch(finalQuery);
}
