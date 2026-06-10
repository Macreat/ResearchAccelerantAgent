import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdf = require("pdf-parse");
import { env } from "../lib/env";
import * as fs from "fs";
import * as fsp from "fs/promises";

// ============================================================================
// Types
// ============================================================================
export interface PDFExtractionResult {
  url: string;
  title: string;
  success: boolean;
  totalPages: number;
  extractedText: string;
  contentSummary: string;
  keyFindings: string[];
  error?: string;
}

export interface LLMAnalysisRequest {
  content: string;
  query: string;
  context?: string;
}

export interface LLMAnalysisResult {
  query: string;
  answer: string;
  confidence: number;
  relatedSections: string[];
}

// ============================================================================
// PDF Text Extraction (via pdf-parse)
// ============================================================================
export async function extractPDFText(pdfUrl: string): Promise<string> {
  try {
    let buffer: Buffer;

    if (pdfUrl.startsWith("http")) {
      const response = await fetch(pdfUrl, {
        headers: {
          Accept: "application/pdf",
          "User-Agent": "ResearchAccelerant/1.0",
        },
      });

      if (!response.ok) {
        throw new Error(`PDF fetch failed: ${response.status}`);
      }

      buffer = Buffer.from(await response.arrayBuffer());
    } else {
      // Assume local file path
      if (!fs.existsSync(pdfUrl)) {
        throw new Error(`Local PDF file not found: ${pdfUrl}`);
      }
      buffer = await fsp.readFile(pdfUrl);
    }

    const data = await pdf(buffer);
    return data.text || "";
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`PDF extraction failed for ${pdfUrl}:`, message);
    throw error;
  }
}

// ============================================================================
// Deep Content Analysis via Ollama LLM with Chunking
// ============================================================================
export async function analyzePDFContentWithLLM(
  extractedText: string,
  query: string,
  context?: string
): Promise<LLMAnalysisResult> {
  if (!env.enableLocalLlm) {
    return fallbackAnalysis(extractedText, query);
  }

  // Chunking strategy: process text in chunks of ~12000 chars to cover more ground
  const chunkSize = 12000;
  const chunks = [];
  for (let i = 0; i < extractedText.length; i += chunkSize) {
    chunks.push(extractedText.substring(i, i + chunkSize));
  }

  // Only process top 4 most relevant chunks to keep it efficient but comprehensive
  const relevantChunks = rankChunksByRelevance(chunks, query).slice(0, 4);
  const combinedContext = relevantChunks.join("\n---\n");

  try {
    const prompt = buildAnalysisPrompt(combinedContext, query, context);
    
    console.log(`[Ollama] Analyzing PDF content for query: "${query}"`);

    const response = await fetch(`${env.ollamaUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OLLAMA_MODEL || "llama3.1",
        prompt,
        stream: false,
        options: {
          num_ctx: 16384, // Increase context window for deep research
          temperature: 0.2, // Keep it factual
        }
      }),
    });

    if (!response.ok) {
      console.warn(`Ollama LLM error: ${response.status}`);
      return fallbackAnalysis(extractedText, query);
    }

    const data = await response.json() as { response?: string };
    const answer = data.response || "";

    return {
      query,
      answer: answer.trim(),
      confidence: 0.9,
      relatedSections: extractRelevantSections(combinedContext, query, 3),
    };
  } catch (error) {
    console.warn("LLM analysis failed, using fallback:", error);
    return fallbackAnalysis(extractedText, query);
  }
}

function rankChunksByRelevance(chunks: string[], query: string): string[] {
  const queryWords = query.toLowerCase().split(/\s+/);
  return chunks
    .map((chunk) => {
      let score = 0;
      const lowerChunk = chunk.toLowerCase();
      for (const word of queryWords) {
        if (word.length > 3 && lowerChunk.includes(word)) {
          score += 1;
        }
      }
      return { chunk, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((item) => item.chunk);
}

function buildAnalysisPrompt(
  contextText: string,
  query: string,
  context?: string
): string {
  return `You are a Research Assistant analyzing a scientific paper.
Base your answer STRICTLY on the provided paper excerpts.

--- PAPER EXCERPTS ---
${contextText}
--- END EXCERPTS ---

${context ? `ADDITIONAL CONTEXT: ${context}\n` : ""}

USER QUESTION: ${query}

INSTRUCTIONS:
1. Provide a direct, detailed answer.
2. If the answer isn't in the excerpts, state "The provided sections do not contain specific information about [X]".
3. Cite specific findings or data points from the text where available.

ANSWER:`;
}

function fallbackAnalysis(
  extractedText: string,
  query: string
): LLMAnalysisResult {
  const sections = extractRelevantSections(extractedText, query, 3);
  const answer = sections.length > 0
    ? `Heuristic Analysis: The document mentions "${query}" in several sections. Key findings related to this query include: ${sections.join("; ")}.`
    : `Could not find specific information for "${query}" using basic text search. The document may cover this topic using different terminology.`;

  return {
    query,
    answer,
    confidence: 0.5,
    relatedSections: sections,
  };
}

// ============================================================================
// Section Extraction & Relevance Scoring
// ============================================================================
function extractRelevantSections(
  text: string,
  query: string,
  limit: number = 3
): string[] {
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  if (queryWords.length === 0) return [text.substring(0, 500)];

  const paragraphs = text.split(/\n\n+/).map((p) => p.trim()).filter((p) => p.length > 50);

  const scored = paragraphs
    .map((p) => {
      let score = 0;
      const lowerP = p.toLowerCase();
      for (const word of queryWords) {
        const regex = new RegExp(word, "gi");
        const matches = lowerP.match(regex);
        if (matches) score += matches.length;
      }
      return { p, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.p);

  return scored;
}

// ============================================================================
// Full PDF Processing Pipeline
// ============================================================================
export async function processPDFForAnalysis(
  pdfUrl: string,
  title: string
): Promise<PDFExtractionResult> {
  try {
    const extractedText = await extractPDFText(pdfUrl);

    if (!extractedText || extractedText.length === 0) {
      return {
        url: pdfUrl,
        title,
        success: false,
        totalPages: 0,
        extractedText: "",
        contentSummary: "Failed to extract text from PDF",
        keyFindings: [],
        error: "No text content found in PDF",
      };
    }

    const summary = await generateContentSummary(extractedText);
    const findings = await extractKeyFindings(extractedText);
    const estimatedPages = Math.ceil(extractedText.length / 3000);

    return {
      url: pdfUrl,
      title,
      success: true,
      totalPages: estimatedPages,
      extractedText: extractedText.substring(0, 100000), // Increased limit
      contentSummary: summary,
      keyFindings: findings,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      url: pdfUrl,
      title,
      success: false,
      totalPages: 0,
      extractedText: "",
      contentSummary: "",
      keyFindings: [],
      error: message,
    };
  }
}

async function generateContentSummary(text: string): Promise<string> {
  if (!env.enableLocalLlm) {
    return text.substring(0, 300) + "...";
  }

  try {
    const truncated = text.substring(0, 6000);
    const response = await fetch(`${env.ollamaUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OLLAMA_MODEL || "llama3.1",
        prompt: `Summarize the following research paper's core objective and main results in 3 concise sentences:\n\n${truncated}\n\nSummary:`,
        stream: false,
      }),
    });

    if (response.ok) {
      const data = await response.json() as { response?: string };
      return data.response?.trim() || text.substring(0, 300);
    }
  } catch (error) {
    console.warn("Summary generation failed:", error);
  }

  return text.substring(0, 300) + "...";
}

async function extractKeyFindings(text: string): Promise<string[]> {
  const findings: string[] = [];

  const patterns = [
    /(?:found|findings?:|results?:|demonstrated?)[:\s]+([^.!?]{20,200}[.!?])/gi,
    /(?:key findings?|main results?|conclusion)[:\s]+([^.!?]{20,200}[.!?])/gi,
    /(?:significantly|importantly|notably)[^.!?]{20,200}[.!?]/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null && findings.length < 5) {
      const finding = (match[1] || match[0]).replace(/\s+/g, " ").trim();
      if (finding.length > 40 && !findings.includes(finding)) {
        findings.push(finding);
      }
    }
  }

  return findings.slice(0, 5);
}

// ============================================================================
// Question-Answering on Document
// ============================================================================
export async function askQuestionAboutPDF(
  pdfUrl: string,
  question: string
): Promise<{
  question: string;
  answer: string;
  sourceUrl: string;
  confidence: number;
}> {
  try {
    const text = await extractPDFText(pdfUrl);
    const analysis = await analyzePDFContentWithLLM(text, question);

    return {
      question,
      answer: analysis.answer,
      sourceUrl: pdfUrl,
      confidence: analysis.confidence,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      question,
      answer: `Error analyzing PDF: ${message}`,
      sourceUrl: pdfUrl,
      confidence: 0,
    };
  }
}
