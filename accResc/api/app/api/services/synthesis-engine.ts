/**
 * Synthesis Engine Service
 * Provides cross-study synthesis, gap extraction, and problem statement drafting.
 * Uses a hybrid approach: rule-based heuristics + LLM enhancement when available.
 */

import type { PaperMetadata } from "./academic-search";
import type { SynthesisData, ProblemStatementData } from "./latex-generator";
import { askQuestionAboutPDF, processPDFForAnalysis } from "./pdf-extraction";

// ============================================================================
// Rule-Based Methodology Classifier
// ============================================================================
const METHODOLOGY_PATTERNS: Record<string, string[]> = {
  "Experimental Design": ["experiment", "randomized", "controlled trial", "intervention", "treatment", "manipulation", "laboratory"],
  "Meta-Analysis": ["meta-analysis", "meta analysis", "systematic review", "pooled effect", "forest plot", "heterogeneity"],
  "Longitudinal Survey": ["longitudinal", "panel study", "cohort", "follow-up", "time series", "repeated measures"],
  "Cross-Sectional Survey": ["cross-sectional", "survey", "questionnaire", "prevalence", "descriptive"],
  "Qualitative Case Study": ["qualitative", "case study", "interview", "focus group", "ethnography", "phenomenology", "thematic analysis"],
  "Mixed Methods": ["mixed method", "mixed-method", "triangulation", "convergent", "sequential"],
  "Computational / Simulation": ["simulation", "model", "algorithm", "computational", "machine learning", "neural network", "deep learning"],
};

function classifyMethodology(abstract?: string, title?: string): string {
  const text = `${title || ""} ${abstract || ""}`.toLowerCase();
  const scores: Record<string, number> = {};

  for (const [method, keywords] of Object.entries(METHODOLOGY_PATTERNS)) {
    scores[method] = keywords.reduce((sum, kw) => sum + (text.includes(kw) ? 1 : 0), 0);
  }

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return sorted[0][1] > 0 ? sorted[0][0] : "Not specified";
}

// ============================================================================
// Gap Extraction Heuristics
// ============================================================================
const GAP_INDICATORS = [
  "limited",
  "scarcity",
  "lack of",
  "few studies",
  "little is known",
  "underexplored",
  "under-researched",
  "gap",
  "unclear",
  "insufficient",
  "further research",
  "future work",
  "not well understood",
  "remains to be",
  "calls for",
];

function extractGapHints(abstract?: string): string[] {
  if (!abstract) return [];
  const text = abstract.toLowerCase();
  return GAP_INDICATORS.filter((indicator) => text.includes(indicator));
}

// ============================================================================
// Main Synthesis Engine
// ============================================================================
export async function synthesizePapers(
  papers: PaperMetadata[],
  topic: string
): Promise<SynthesisData> {
  // 1. Classify methodologies
  const methodCounts: Record<string, number> = {};
  for (const paper of papers) {
    const method = classifyMethodology(paper.abstract, paper.title);
    methodCounts[method] = (methodCounts[method] || 0) + 1;
  }

  const dominantMethods = Object.entries(methodCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([method, count]) => `- **${method}**: ${count} stud${count > 1 ? "ies" : "y"}`)
    .join("\n");

  // 2. Extract common themes from titles and abstracts
  const themes = extractThemes(papers);

  // 3. Extract gap hints
  const gapHints: string[] = [];
  for (const paper of papers) {
    const hints = extractGapHints(paper.abstract);
    if (hints.length > 0) {
      gapHints.push(`In \"${paper.title}\" (${paper.year}), authors note: ${hints.join(", ")}.`);
    }
  }

  // 4. Identify recurring gaps
  const identifiedGaps = generateGaps(papers, topic);

  // 5. Assess impact
  const highlyCited = papers.filter((p) => p.citationCount > 50);
  const recent = papers.filter((p) => p.year >= new Date().getFullYear() - 2);

  return {
    methodologicalPatterns: `Across the ${papers.length} reviewed studies on ${topic}, the following methodological patterns emerged:\n\n${dominantMethods}\n\n**Design Distribution:**\n- Total experimental studies: ${methodCounts["Experimental Design"] || 0}\n- Total meta-analyses/systematic reviews: ${(methodCounts["Meta-Analysis"] || 0)}\n- Total longitudinal studies: ${methodCounts["Longitudinal Survey"] || 0}\n- Total qualitative studies: ${methodCounts["Qualitative Case Study"] || 0}\n- Total computational studies: ${methodCounts["Computational / Simulation"] || 0}`,

    overarchingFindings: `**Consensus Themes:**\n${themes.consensus.map((t) => `- ${t}`).join("\n") || "- No clear consensus emerged across studies."}\n\n**Emergent Trends:**\n${themes.emerging.map((t) => `- ${t}`).join("\n") || "- No clear trends identified."}\n\n**Contradictions/Debates:**\n${themes.debates.map((t) => `- ${t}`).join("\n") || "- No major contradictions noted."}`,

    recurringGaps: `**Limitations noted by authors:**\n${gapHints.slice(0, 5).join("\n") || "- Authors of reviewed studies did not explicitly identify methodological limitations."}\n\n**Systematic gaps in the literature:**\n${identifiedGaps.map((g, i) => `${i + 1}. ${g}`).join("\n")}`,

    impactAssessment: `**High-Impact Studies (>$50$ citations):** ${highlyCited.length} out of ${papers.length} reviewed studies (${Math.round((highlyCited.length / papers.length) * 100)}\%).\n\n**Recent Contributions (${new Date().getFullYear() - 2}+):** ${recent.length} studies.\n\n**Most Cited Study:** ${papers[0]?.title || "N/A"} (${papers[0]?.citationCount || 0} citations).\n\n**Open Access Availability:** ${papers.filter((p) => p.pdfUrl).length} of ${papers.length} studies (${Math.round((papers.filter((p) => p.pdfUrl).length / papers.length) * 100)}\%) provide open access to their full text.`,

    futureDirections: `Based on the identified gaps, the following research directions are recommended:\n\n${identifiedGaps.map((g, i) => `${i + 1}. **${g.split(":")[0] || g}**: Further investigation needed to address ${g.toLowerCase()}.`).join("\n")}`,

    identifiedGaps,
  };
}

// ============================================================================
// Theme Extraction
// ============================================================================
function extractThemes(papers: PaperMetadata[]): {
  consensus: string[];
  emerging: string[];
  debates: string[];
} {
  const consensus: string[] = [];
  const emerging: string[] = [];
  const debates: string[] = [];

  // Extract common words from titles (excluding stop words)
  const stopWords = new Set(["the", "a", "an", "of", "in", "on", "for", "and", "to", "with", "using", "based", "study", "research", "analysis"]);
  const wordFreq: Record<string, number> = {};

  for (const paper of papers) {
    const words = (paper.title || "").toLowerCase().split(/\W+/).filter((w) => w.length > 3 && !stopWords.has(w));
    for (const w of words) {
      wordFreq[w] = (wordFreq[w] || 0) + 1;
    }
  }

  const commonWords = Object.entries(wordFreq)
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word]) => word);

  if (commonWords.length > 0) {
    consensus.push(`Multiple studies focus on: ${commonWords.join(", ")}.`);
  }

  // Check for recent vs. older methodological shifts
  const recentPapers = papers.filter((p) => p.year >= new Date().getFullYear() - 3);
  if (recentPapers.length > 0) {
    emerging.push(`${recentPapers.length} recent studies (${recentPapers[0].year}-${recentPapers[recentPapers.length - 1].year}) indicate evolving methodological approaches.`);
  }

  return { consensus, emerging, debates };
}

// ============================================================================
// Gap Generation
// ============================================================================
function generateGaps(papers: PaperMetadata[], topic: string): string[] {
  const gaps: string[] = [];

  // Gap 1: Geographic scope
  gaps.push(`Geographic scope: Most studies on ${topic} may be concentrated in specific regions, limiting generalizability to diverse populations.`);

  // Gap 2: Methodological diversity
  const methods = papers.map((p) => classifyMethodology(p.abstract, p.title));
  const uniqueMethods = new Set(methods);
  if (uniqueMethods.size < 3) {
    gaps.push(`Methodological narrowness: The literature relies heavily on ${Array.from(uniqueMethods).join(", ")} approaches, with limited triangulation.`);
  } else {
    gaps.push(`Cross-method integration: While diverse methods exist (${Array.from(uniqueMethods).slice(0, 4).join(", ")}), few studies combine approaches for robust validation.`);
  }

  // Gap 3: Temporal/sample limitations
  gaps.push(`Sample and temporal constraints: Many studies use cross-sectional designs or limited sample sizes, limiting causal inference about ${topic}.`);

  // Gap 4: Practical application
  gaps.push(`Translation to practice: Limited evidence on how findings regarding ${topic} translate into actionable interventions or policy recommendations.`);

  return gaps;
}

// ============================================================================
// Problem Statement Generator
// ============================================================================
export async function draftProblemStatement(
  synthesis: SynthesisData,
  selectedGapIndex: number,
  topic: string
): Promise<ProblemStatementData> {
  const selectedGap = synthesis.identifiedGaps[selectedGapIndex] || synthesis.identifiedGaps[0] || "Unknown gap";

  return {
    whatIsKnown: `The literature on ${topic} has established foundational knowledge across ${synthesis.methodologicalPatterns?.split("\n")[0] || "multiple domains"}. Key studies have contributed empirical evidence and theoretical frameworks.`,

    whatIsMissing: selectedGap,

    affectedStakeholders: `Researchers, practitioners, and policymakers working with ${topic} are directly affected by this gap, as are the populations ultimately served by evidence-based interventions.`,

    consequencesOfInaction: `Without addressing this gap, decision-makers will continue to rely on incomplete or non-generalizable evidence, potentially leading to ineffective strategies and missed opportunities for improvement in ${topic}.`,

    howStudyAddressesGap: `The proposed study will employ rigorous methodology to directly investigate ${selectedGap.toLowerCase()}, generating actionable evidence to fill this critical gap in the literature.`,

    selectedGapIndex,

    fullStatement: `Despite advances in understanding ${topic}, a critical gap remains: ${selectedGap.toLowerCase()}. This is problematic because current evidence is insufficient to guide effective practice across diverse contexts. The proposed study addresses this gap by conducting rigorous, contextually grounded research that will produce generalizable findings and actionable recommendations for stakeholders in the field.`,
  };
}

// ============================================================================
// Paper Content Analysis & Q&A
// ============================================================================
export async function answerQuestionAboutPaper(
  paper: PaperMetadata,
  question: string
): Promise<{
  paperId: string;
  paperTitle: string;
  question: string;
  answer: string;
  confidence: number;
  success: boolean;
}> {
  if (!paper.pdfUrl) {
    return {
      paperId: paper.externalId,
      paperTitle: paper.title,
      question,
      answer: `No PDF available for "${paper.title}". Only abstract available: ${paper.abstract || "No abstract"}`,
      confidence: 0,
      success: false,
    };
  }

  try {
    const result = await askQuestionAboutPDF(paper.pdfUrl, question);
    return {
      paperId: paper.externalId,
      paperTitle: paper.title,
      question: result.question,
      answer: result.answer,
      confidence: result.confidence,
      success: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      paperId: paper.externalId,
      paperTitle: paper.title,
      question,
      answer: `Failed to analyze PDF: ${message}`,
      confidence: 0,
      success: false,
    };
  }
}

export async function extractPaperContent(
  paper: PaperMetadata
): Promise<{
  paperId: string;
  paperTitle: string;
  contentExtracted: boolean;
  summary?: string;
  keyFindings?: string[];
  totalPages?: number;
  error?: string;
}> {
  if (!paper.pdfUrl) {
    return {
      paperId: paper.externalId,
      paperTitle: paper.title,
      contentExtracted: false,
      error: "No PDF URL available",
    };
  }

  try {
    const result = await processPDFForAnalysis(paper.pdfUrl, paper.title);
    if (result.success) {
      return {
        paperId: paper.externalId,
        paperTitle: paper.title,
        contentExtracted: true,
        summary: result.contentSummary,
        keyFindings: result.keyFindings,
        totalPages: result.totalPages,
      };
    } else {
      return {
        paperId: paper.externalId,
        paperTitle: paper.title,
        contentExtracted: false,
        error: result.error || "Failed to extract PDF content",
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      paperId: paper.externalId,
      paperTitle: paper.title,
      contentExtracted: false,
      error: message,
    };
  }
}
