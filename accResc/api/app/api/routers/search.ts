import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
import { searchPapers } from "../services/academic-search";
import { memoryStore } from "../services/memory-store";

export const searchRouter = createRouter({
  // ========================================================================
  // Create a new search session
  // ========================================================================
  createSession: publicQuery
    .input(
      z.object({
        topic: z.string().min(1).max(500),
        numStudies: z.number().min(1).max(50).default(5),
        yearFrom: z.number().min(1900).max(2100).default(2020),
        yearTo: z.number().min(1900).max(2100).default(2026),
        citationMin: z.number().min(0).default(1),
        databases: z.string().default("google_scholar,semantic_scholar,openalex"),
        keywords: z.string().optional(),
        inclusionCriteria: z.string().optional(),
        exclusionCriteria: z.string().optional(),
        bibFormat: z.enum(["APA", "MLA", "Chicago", "IEEE", "BibTeX"]).default("APA"),
        version: z.enum(["mvp", "v2", "v3"]).default("mvp"),
      })
    )
    .mutation(({ input }) => {
      const session = memoryStore.createSession({
        topic: input.topic,
        numStudies: input.numStudies,
        yearFrom: input.yearFrom,
        yearTo: input.yearTo,
        citationMin: input.citationMin,
        databases: input.databases,
        keywords: input.keywords,
        inclusionCriteria: input.inclusionCriteria,
        exclusionCriteria: input.exclusionCriteria,
        bibFormat: input.bibFormat,
        version: input.version,
        status: "pending",
      });

      return { sessionId: session.id };
    }),

  // ========================================================================
  // Execute search and populate papers
  // ========================================================================
  execute: publicQuery
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ input }) => {
      const session = memoryStore.getSession(input.sessionId);
      if (!session) throw new Error("Session not found");

      memoryStore.updateSession(input.sessionId, { status: "searching" });

      try {
        const dbList = session.databases.split(",").map((d) => d.trim());
        const results = await searchPapers({
          topic: session.topic,
          keywords: session.keywords || undefined,
          yearFrom: session.yearFrom,
          yearTo: session.yearTo,
          citationMin: session.citationMin,
          numStudies: session.numStudies,
          databases: dbList,
          inclusionCriteria: session.inclusionCriteria || undefined,
          exclusionCriteria: session.exclusionCriteria || undefined,
        });

        memoryStore.updateSession(input.sessionId, { status: "extracting" });

        for (const paper of results) {
          memoryStore.addPaper({
            sessionId: input.sessionId,
            externalId: paper.externalId,
            source: paper.source,
            title: paper.title,
            authors: JSON.stringify(paper.authors),
            year: paper.year,
            journal: paper.journal || null,
            volume: paper.volume || null,
            issue: paper.issue || null,
            pages: paper.pages || null,
            doi: paper.doi || null,
            url: paper.url,
            abstract: paper.abstract || null,
            citationCount: paper.citationCount,
            citationCountSource: paper.citationCountSource,
            pdfUrl: paper.pdfUrl || null,
            relevanceScore: paper.relevanceScore,
            isSelected: 1,
          });
        }

        const nextStatus = session.version === "mvp" ? "completed" : "synthesizing";
        memoryStore.updateSession(input.sessionId, { status: nextStatus });

        return {
          success: true,
          papersFound: results.length,
          sessionId: input.sessionId,
          status: nextStatus,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        memoryStore.updateSession(input.sessionId, { status: "error", errorMessage: message });
        throw new Error(`Search failed: ${message}`);
      }
    }),

  // ========================================================================
  // Get session details with papers
  // ========================================================================
  getSession: publicQuery
    .input(z.object({ sessionId: z.number() }))
    .query(({ input }) => {
      const session = memoryStore.getSession(input.sessionId);
      if (!session) throw new Error("Session not found");

      const sessionPapers = memoryStore.getPapersForSession(input.sessionId);

      return {
        session,
        papers: sessionPapers.map((p) => ({
          ...p,
          authors: p.authors ? JSON.parse(p.authors as string) : [],
        })),
      };
    }),

  // ========================================================================
  // List all sessions
  // ========================================================================
  listSessions: publicQuery.query(() => {
    return memoryStore.listSessions();
  }),

  // ========================================================================
  // Delete a session
  // ========================================================================
  deleteSession: publicQuery
    .input(z.object({ sessionId: z.number() }))
    .mutation(({ input }) => {
      memoryStore.deleteSession(input.sessionId);
      return { success: true };
    }),

  // ========================================================================
  // Advanced Search: Hybrid local + external with smart ranking
  // ========================================================================
  advancedSearch: publicQuery
    .input(
      z.object({
        topic: z.string().min(1).max(500),
        keywords: z.array(z.string()).min(1).max(20),
        yearFrom: z.number().min(1900).max(2100).default(2018),
        yearTo: z.number().min(1900).max(2100).default(2026),
        citationMin: z.number().min(0).default(0),
        bibFormat: z.enum(["APA", "IEEE", "MLA", "BibTeX"]).default("APA"),
        searchStrategy: z.enum(["local", "hybrid", "external"]).default("hybrid"),
        returnCount: z.number().min(1).max(20).default(5),
        includeLocalDocs: z.boolean().default(true),
        includeExternalAPIs: z.boolean().default(true),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const { performAdvancedSearch } = await import("../services/advanced-research-pipeline");
        const result = await performAdvancedSearch(input);
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        throw new Error(`Advanced search failed: ${message}`);
      }
    }),

  // ========================================================================
  // Generate Bibliography from papers
  // ========================================================================
  generateBibliography: publicQuery
    .input(
      z.object({
        papers: z.array(
          z.object({
            id: z.string(),
            title: z.string(),
            authors: z.array(z.string()),
            year: z.number(),
            abstract: z.string(),
            journal: z.string().optional(),
            url: z.string(),
            citations: z.number(),
            source: z.enum(["local", "semantic_scholar", "google_scholar", "openalex"]),
            relevanceScore: z.number(),
            keywordMatches: z.array(z.string()),
          })
        ),
        bibFormat: z.enum(["APA", "IEEE", "MLA", "BibTeX"]).default("APA"),
      })
    )
    .query(({ input }) => {
      const { generateBibliography } = require("../services/advanced-research-pipeline");
      const bibliography = generateBibliography(
        input.papers as any,
        input.bibFormat
      );
      return { bibliography, format: input.bibFormat, count: input.papers.length };
    }),

  // ========================================================================
  // Semantic search on local documents only
  // ========================================================================
  semanticSearchLocal: publicQuery
    .input(
      z.object({
        query: z.string().min(1),
        keywords: z.array(z.string()).min(1).max(10),
        returnCount: z.number().min(1).max(10).default(5),
      })
    )
    .query(async ({ input }) => {
      try {
        const { searchLocalDocuments } = await import("../services/advanced-research-pipeline");
        const papers = await searchLocalDocuments({
          topic: input.query,
          keywords: input.keywords,
          yearFrom: 2000,
          yearTo: 2026,
          citationMin: 0,
          bibFormat: "APA",
          searchStrategy: "local",
          returnCount: input.returnCount,
          includeLocalDocs: true,
          includeExternalAPIs: false,
        });
        return {
          query: input.query,
          papersFound: papers.length,
          papers,
          duration: 0,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        throw new Error(`Local semantic search failed: ${message}`);
      }
    }),

  // ========================================================================
  // Keyword expansion for niche topics
  // ========================================================================
  expandKeywords: publicQuery
    .input(
      z.object({
        topic: z.string().min(1),
        keywords: z.array(z.string()).min(1).max(10),
      })
    )
    .query(async ({ input }) => {
      try {
        const { expandKeywords } = await import("../services/advanced-research-pipeline");
        const expanded = await expandKeywords(input.topic, input.keywords);
        return {
          original: input.keywords,
          expanded,
          newCount: expanded.length - input.keywords.length,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        throw new Error(`Keyword expansion failed: ${message}`);
      }
    }),

  // ========================================================================
  // VHF Monitoring specialized pipeline
  // ========================================================================
  vhfMonitoringSearch: publicQuery.query(async () => {
    try {
      const { createVHFMonitoringPipeline, executeHybridSearch } = await import(
        "../services/advanced-research-pipeline"
      );
      const query = await createVHFMonitoringPipeline();
      const result = await executeHybridSearch(query);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`VHF monitoring search failed: ${message}`);
    }
  }),
});
