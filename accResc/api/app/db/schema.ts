import {
  sqliteTable,
  text,
  integer,
  index,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const searchSessions = sqliteTable("search_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  topic: text("topic").notNull(),
  numStudies: integer("num_studies").notNull().default(5),
  yearFrom: integer("year_from").notNull().default(2020),
  yearTo: integer("year_to").notNull().default(2026),
  citationMin: integer("citation_min").notNull().default(1),
  databases: text("databases").notNull().default("semantic_scholar,openalex"),
  keywords: text("keywords"),
  inclusionCriteria: text("inclusion_criteria"),
  exclusionCriteria: text("exclusion_criteria"),
  bibFormat: text("bib_format").notNull().default("APA"), // Enum fallback to text
  status: text("status").notNull().default("pending"), // Enum fallback to text
  version: text("version").notNull().default("mvp"), // Enum fallback to text
  errorMessage: text("error_message"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const papers = sqliteTable("papers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: integer("session_id").notNull().references(() => searchSessions.id, { onDelete: "cascade" }),
  externalId: text("external_id").notNull(),
  source: text("source").notNull(),
  title: text("title").notNull(),
  authors: text("authors"),
  year: integer("year"),
  journal: text("journal"),
  volume: text("volume"),
  issue: text("issue"),
  pages: text("pages"),
  doi: text("doi"),
  url: text("url"),
  abstract: text("abstract"),
  methodology: text("methodology"),
  keyFindings: text("key_findings"),
  gapsAndLimitations: text("gaps_and_limitations"),
  citationCount: integer("citation_count").default(0),
  citationCountSource: text("citation_count_source"),
  pdfUrl: text("pdf_url"),
  relevanceScore: integer("relevance_score"),
  isSelected: integer("is_selected").notNull().default(1),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  sessionIdx: index("papers_session_idx").on(table.sessionId),
  externalIdx: index("papers_external_idx").on(table.externalId),
}));

export const synthesisResults = sqliteTable("synthesis_results", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: integer("session_id").notNull().references(() => searchSessions.id, { onDelete: "cascade" }),
  methodologicalPatterns: text("methodological_patterns"),
  overarchingFindings: text("overarching_findings"),
  recurringGaps: text("recurring_gaps"),
  impactAssessment: text("impact_assessment"),
  futureDirections: text("future_directions"),
  identifiedGaps: text("identified_gaps"), // Store as JSON string
  rawSynthesis: text("raw_synthesis"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  sessionIdx: index("synthesis_session_idx").on(table.sessionId),
}));

export const problemStatements = sqliteTable("problem_statements", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: integer("session_id").notNull().references(() => searchSessions.id, { onDelete: "cascade" }),
  whatIsKnown: text("what_is_known"),
  whatIsMissing: text("what_is_missing"),
  affectedStakeholders: text("affected_stakeholders"),
  consequencesOfInaction: text("consequences_of_inaction"),
  howStudyAddressesGap: text("how_study_addresses_gap"),
  selectedGapIndex: integer("selected_gap_index"),
  fullStatement: text("full_statement"),
  latexOutput: text("latex_output"),
  status: text("status").notNull().default("draft"), // Enum fallback to text
  humanFeedback: text("human_feedback"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  sessionIdx: index("problem_session_idx").on(table.sessionId),
}));

export const latexOutputs = sqliteTable("latex_outputs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: integer("session_id").notNull().references(() => searchSessions.id, { onDelete: "cascade" }),
  documentType: text("document_type").notNull(), // Enum fallback to text
  latexContent: text("latex_content").notNull(),
  compiledPdfUrl: text("compiled_pdf_url"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  sessionIdx: index("latex_session_idx").on(table.sessionId),
}));

export const localDocuments = sqliteTable("local_documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fileName: text("file_name").notNull(),
  relativePath: text("relative_path").notNull(),
  absolutePath: text("absolute_path").notNull(),
  sha256: text("sha256").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  mimeType: text("mime_type").notNull().default("application/pdf"),
  title: text("title"),
  extractedText: text("extracted_text"),
  embedding: text("embedding"), // Store as JSON string
  indexedAt: text("indexed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  shaIdx: index("local_documents_sha_idx").on(table.sha256),
  fileIdx: index("local_documents_file_idx").on(table.fileName),
}));
