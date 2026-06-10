import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
import { memoryStore } from "../services/memory-store";
import {
  generateLiteratureReviewLaTeX,
  generateSynthesisLaTeX,
  generateProblemStatementLaTeX,
  generateFullPipelineLaTeX,
  generateMethodologicalReportLaTeX,
  generateArchitectureReportLaTeX,
} from "../services/latex-generator";
import {
  compileLaTeXToPDF,
  getDefaultPDFConfig,
  listGeneratedPDFs,
  ensureOutputDirectories,
} from "../services/latex-to-pdf";
import { saveTexToDocsDir } from "../services/local-docs";
import type { PaperMetadata, SynthesisData, ProblemStatementData } from "../services/latex-generator";

export const latexRouter = createRouter({
  generateReview: publicQuery
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ input }) => {
      const session = memoryStore.getSession(input.sessionId);
      if (!session) throw new Error("Session not found");

      const sessionPapers = memoryStore.getPapersForSession(input.sessionId);
      if (sessionPapers.length === 0) throw new Error("No papers found. Run search first.");

      const paperMetadata: PaperMetadata[] = sessionPapers.map((p) => ({
        externalId: p.externalId,
        source: p.source,
        title: p.title,
        authors: p.authors ? JSON.parse(p.authors as string) : [],
        year: p.year || 0,
        journal: p.journal || undefined,
        volume: p.volume || undefined,
        issue: p.issue || undefined,
        pages: p.pages || undefined,
        doi: p.doi || undefined,
        url: p.url || "",
        abstract: p.abstract || undefined,
        citationCount: p.citationCount || 0,
        citationCountSource: p.citationCountSource || "",
        pdfUrl: p.pdfUrl || undefined,
        relevanceScore: p.relevanceScore || 0,
      }));

      const latex = generateLiteratureReviewLaTeX(
        paperMetadata,
        session.topic,
        session.yearFrom,
        session.yearTo,
        session.bibFormat as "APA" | "MLA" | "Chicago" | "IEEE" | "BibTeX"
      );

      memoryStore.createLatexOutput({
        sessionId: input.sessionId,
        documentType: "literature_review",
        latexContent: latex,
        compiledPdfUrl: null,
      });

      // Persist to document index
      await saveTexToDocsDir(latex, `LiteratureReview_${input.sessionId}_${Date.now()}.tex`);

      return { latex, sessionId: input.sessionId };
    }),

  generateSynthesis: publicQuery
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ input }) => {
      const session = memoryStore.getSession(input.sessionId);
      if (!session) throw new Error("Session not found");

      const sessionPapers = memoryStore.getPapersForSession(input.sessionId);
      const synResult = memoryStore.getSynthesisForSession(input.sessionId);
      if (!synResult) throw new Error("No synthesis found. Run synthesis first.");

      const paperMetadata: PaperMetadata[] = sessionPapers.map((p) => ({
        externalId: p.externalId,
        source: p.source,
        title: p.title,
        authors: p.authors ? JSON.parse(p.authors as string) : [],
        year: p.year || 0,
        journal: p.journal || undefined,
        volume: p.volume || undefined,
        issue: p.issue || undefined,
        pages: p.pages || undefined,
        doi: p.doi || undefined,
        url: p.url || "",
        abstract: p.abstract || undefined,
        citationCount: p.citationCount || 0,
        citationCountSource: p.citationCountSource || "",
        pdfUrl: p.pdfUrl || undefined,
        relevanceScore: p.relevanceScore || 0,
      }));

      const synthesis: SynthesisData = {
        methodologicalPatterns: synResult.methodologicalPatterns || "",
        overarchingFindings: synResult.overarchingFindings || "",
        recurringGaps: synResult.recurringGaps || "",
        impactAssessment: synResult.impactAssessment || "",
        futureDirections: synResult.futureDirections || "",
        identifiedGaps: (synResult.identifiedGaps as string[]) || [],
      };

      const latex = generateSynthesisLaTeX(
        paperMetadata,
        synthesis,
        session.topic,
        session.bibFormat as "APA" | "MLA" | "Chicago" | "IEEE" | "BibTeX"
      );

      memoryStore.createLatexOutput({
        sessionId: input.sessionId,
        documentType: "synthesis",
        latexContent: latex,
        compiledPdfUrl: null,
      });

      // Persist to document index
      await saveTexToDocsDir(latex, `Synthesis_${input.sessionId}_${Date.now()}.tex`);

      return { latex, sessionId: input.sessionId };
    }),

  generateStatement: publicQuery
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ input }) => {
      const session = memoryStore.getSession(input.sessionId);
      if (!session) throw new Error("Session not found");

      const psResult = memoryStore.getProblemStatementForSession(input.sessionId);
      const synResult = memoryStore.getSynthesisForSession(input.sessionId);

      let psData: ProblemStatementData;

      if (psResult) {
        psData = {
          whatIsKnown: psResult.whatIsKnown || "",
          whatIsMissing: psResult.whatIsMissing || "",
          affectedStakeholders: psResult.affectedStakeholders || "",
          consequencesOfInaction: psResult.consequencesOfInaction || "",
          howStudyAddressesGap: psResult.howStudyAddressesGap || "",
          selectedGapIndex: psResult.selectedGapIndex || 0,
          fullStatement: psResult.fullStatement || "",
        };
      } else {
        if (!synResult) throw new Error("No synthesis found. Run synthesis first.");

        const { draftProblemStatement } = await import("../services/synthesis-engine");
        const synthesis: SynthesisData = {
          methodologicalPatterns: synResult.methodologicalPatterns || "",
          overarchingFindings: synResult.overarchingFindings || "",
          recurringGaps: synResult.recurringGaps || "",
          impactAssessment: synResult.impactAssessment || "",
          futureDirections: synResult.futureDirections || "",
          identifiedGaps: (synResult.identifiedGaps as string[]) || [],
        };

        psData = await draftProblemStatement(synthesis, 0, session.topic);

        memoryStore.createProblemStatement({
          sessionId: input.sessionId,
          ...psData,
          latexOutput: null,
          status: "draft",
          humanFeedback: null,
        });
      }

      const selectedGap = synResult
        ? ((synResult.identifiedGaps as string[]) || [])[psData.selectedGapIndex || 0]
        : undefined;

      const latex = generateProblemStatementLaTeX(psData, session.topic, selectedGap);

      memoryStore.createLatexOutput({
        sessionId: input.sessionId,
        documentType: "problem_statement",
        latexContent: latex,
        compiledPdfUrl: null,
      });

      // Persist to document index
      await saveTexToDocsDir(latex, `ProblemStatement_${input.sessionId}_${Date.now()}.tex`);

      return { latex, sessionId: input.sessionId };
    }),

  generateFullPipeline: publicQuery
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ input }) => {
      const session = memoryStore.getSession(input.sessionId);
      if (!session) throw new Error("Session not found");

      const sessionPapers = memoryStore.getPapersForSession(input.sessionId);
      const synResult = memoryStore.getSynthesisForSession(input.sessionId);
      const psResult = memoryStore.getProblemStatementForSession(input.sessionId);

      if (sessionPapers.length === 0) throw new Error("No papers found.");
      if (!synResult) throw new Error("No synthesis found.");

      const paperMetadata: PaperMetadata[] = sessionPapers.map((p) => ({
        externalId: p.externalId,
        source: p.source,
        title: p.title,
        authors: p.authors ? JSON.parse(p.authors as string) : [],
        year: p.year || 0,
        journal: p.journal || undefined,
        volume: p.volume || undefined,
        issue: p.issue || undefined,
        pages: p.pages || undefined,
        doi: p.doi || undefined,
        url: p.url || "",
        abstract: p.abstract || undefined,
        citationCount: p.citationCount || 0,
        citationCountSource: p.citationCountSource || "",
        pdfUrl: p.pdfUrl || undefined,
        relevanceScore: p.relevanceScore || 0,
      }));

      const synthesis: SynthesisData = {
        methodologicalPatterns: synResult.methodologicalPatterns || "",
        overarchingFindings: synResult.overarchingFindings || "",
        recurringGaps: synResult.recurringGaps || "",
        impactAssessment: synResult.impactAssessment || "",
        futureDirections: synResult.futureDirections || "",
        identifiedGaps: (synResult.identifiedGaps as string[]) || [],
      };

      const psData: ProblemStatementData = psResult
        ? {
            whatIsKnown: psResult.whatIsKnown || "",
            whatIsMissing: psResult.whatIsMissing || "",
            affectedStakeholders: psResult.affectedStakeholders || "",
            consequencesOfInaction: psResult.consequencesOfInaction || "",
            howStudyAddressesGap: psResult.howStudyAddressesGap || "",
            selectedGapIndex: psResult.selectedGapIndex || 0,
            fullStatement: psResult.fullStatement || "",
          }
        : {
            whatIsKnown: "",
            whatIsMissing: "",
            affectedStakeholders: "",
            consequencesOfInaction: "",
            howStudyAddressesGap: "",
            selectedGapIndex: 0,
            fullStatement: "",
          };

      const latex = generateFullPipelineLaTeX(
        paperMetadata,
        synthesis,
        psData,
        session.topic,
        session.yearFrom,
        session.yearTo,
        session.bibFormat as "APA" | "MLA" | "Chicago" | "IEEE" | "BibTeX"
      );

      memoryStore.createLatexOutput({
        sessionId: input.sessionId,
        documentType: "full_pipeline",
        latexContent: latex,
        compiledPdfUrl: null,
      });

      // Persist to document index
      await saveTexToDocsDir(latex, `FullPipeline_${input.sessionId}_${Date.now()}.tex`);

      return { latex, sessionId: input.sessionId };
    }),

  listBySession: publicQuery
    .input(z.object({ sessionId: z.number() }))
    .query(({ input }) => {
      return memoryStore.getLatexOutputsForSession(input.sessionId);
    }),

  // ========================================================================
  // PDF Generation Endpoints
  // ========================================================================
  compileToPDF: publicQuery
    .input(
      z.object({
        sessionId: z.number(),
        documentType: z.enum(["literature_review", "synthesis", "problem_statement", "full_pipeline"]),
        outputFileName: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const session = memoryStore.getSession(input.sessionId);
      if (!session) throw new Error("Session not found");

      const config = getDefaultPDFConfig();
      ensureOutputDirectories(config);

      // Get LaTeX content
      const latexOutput = memoryStore.getLatexOutputsForSession(input.sessionId).find(
        (o) => o.documentType === input.documentType
      );

      if (!latexOutput || !latexOutput.latexContent) {
        throw new Error(`No LaTeX generated for ${input.documentType}`);
      }

      // Write LaTeX to temporary file
      const fs = await import("fs");
      const path = await import("path");
      const tempTexFile = path.join(config.tempDir, `${input.documentType}_${input.sessionId}.tex`);

      fs.writeFileSync(tempTexFile, latexOutput.latexContent, "utf-8");

      // Compile to PDF
      const result = await compileLaTeXToPDF(
        tempTexFile,
        input.outputFileName || `${input.documentType}_${input.sessionId}.pdf`,
        config
      );

      if (!result.success) {
        throw new Error(`PDF compilation failed: ${result.error}`);
      }

      // Update memory store
      memoryStore.createLatexOutput({
        sessionId: input.sessionId,
        documentType: input.documentType,
        latexContent: latexOutput.latexContent,
        compiledPdfUrl: result.pdfFilePath || null,
      });

      return {
        success: true,
        pdfPath: result.pdfFilePath,
        fileSize: result.fileSize,
        compilationTime: result.compilationTime,
        message: result.message,
      };
    }),

  // ========================================================================
  // List Generated PDFs
  // ========================================================================
  listGeneratedPDFs: publicQuery.query(() => {
    const config = getDefaultPDFConfig();
    ensureOutputDirectories(config);
    return listGeneratedPDFs(config);
  }),

  // ========================================================================
  // Generate Methodological Report
  // ========================================================================
  generateMethodologicalReport: publicQuery
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ input }) => {
      const session = memoryStore.getSession(input.sessionId);
      if (!session) throw new Error("Session not found");

      const sessionPapers = memoryStore.getPapersForSession(input.sessionId);
      const synResult = memoryStore.getSynthesisForSession(input.sessionId);

      if (!synResult) throw new Error("No synthesis found. Run synthesis first.");

      const paperMetadata: PaperMetadata[] = sessionPapers.map((p) => ({
        externalId: p.externalId,
        source: p.source,
        title: p.title,
        authors: p.authors ? JSON.parse(p.authors as string) : [],
        year: p.year || 0,
        journal: p.journal || undefined,
        volume: p.volume || undefined,
        issue: p.issue || undefined,
        pages: p.pages || undefined,
        doi: p.doi || undefined,
        url: p.url || "",
        abstract: p.abstract || undefined,
        citationCount: p.citationCount || 0,
        citationCountSource: p.citationCountSource || "",
        pdfUrl: p.pdfUrl || undefined,
        relevanceScore: p.relevanceScore || 0,
      }));

      const synthesis: SynthesisData = {
        methodologicalPatterns: synResult.methodologicalPatterns || "",
        overarchingFindings: synResult.overarchingFindings || "",
        recurringGaps: synResult.recurringGaps || "",
        impactAssessment: synResult.impactAssessment || "",
        futureDirections: synResult.futureDirections || "",
        identifiedGaps: (synResult.identifiedGaps as string[]) || [],
      };

      const latex = generateMethodologicalReportLaTeX(session.topic, synthesis, paperMetadata);

      memoryStore.createLatexOutput({
        sessionId: input.sessionId,
        documentType: "methodological_report",
        latexContent: latex,
        compiledPdfUrl: null,
      });

      // Persist to document index
      await saveTexToDocsDir(latex, `MethodologicalReport_${input.sessionId}_${Date.now()}.tex`);

      return { latex, sessionId: input.sessionId };
    }),

  // ========================================================================
  // Generate Architecture Report
  // ========================================================================
  generateArchitectureReport: publicQuery
    .input(
      z.object({
        sessionId: z.number(),
        systemName: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const session = memoryStore.getSession(input.sessionId);
      if (!session) throw new Error("Session not found");

      const sessionPapers = memoryStore.getPapersForSession(input.sessionId);
      const synResult = memoryStore.getSynthesisForSession(input.sessionId);

      if (!synResult) throw new Error("No synthesis found. Run synthesis first.");

      const paperMetadata: PaperMetadata[] = sessionPapers.map((p) => ({
        externalId: p.externalId,
        source: p.source,
        title: p.title,
        authors: p.authors ? JSON.parse(p.authors as string) : [],
        year: p.year || 0,
        journal: p.journal || undefined,
        volume: p.volume || undefined,
        issue: p.issue || undefined,
        pages: p.pages || undefined,
        doi: p.doi || undefined,
        url: p.url || "",
        abstract: p.abstract || undefined,
        citationCount: p.citationCount || 0,
        citationCountSource: p.citationCountSource || "",
        pdfUrl: p.pdfUrl || undefined,
        relevanceScore: p.relevanceScore || 0,
      }));

      const synthesis: SynthesisData = {
        methodologicalPatterns: synResult.methodologicalPatterns || "",
        overarchingFindings: synResult.overarchingFindings || "",
        recurringGaps: synResult.recurringGaps || "",
        impactAssessment: synResult.impactAssessment || "",
        futureDirections: synResult.futureDirections || "",
        identifiedGaps: (synResult.identifiedGaps as string[]) || [],
      };

      const latex = generateArchitectureReportLaTeX(input.systemName, paperMetadata, synthesis);

      memoryStore.createLatexOutput({
        sessionId: input.sessionId,
        documentType: "architecture_report",
        latexContent: latex,
        compiledPdfUrl: null,
      });

      // Persist to document index
      await saveTexToDocsDir(latex, `ArchitectureReport_${input.systemName}_${input.sessionId}_${Date.now()}.tex`);

      return { latex, sessionId: input.sessionId };
    }),
});
