import crypto from "crypto";
import { execFile } from "child_process";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { promisify } from "util";
import { env } from "../lib/env";
import { extractPDFText, analyzePDFContentWithLLM } from "./pdf-extraction";

const execFileAsync = promisify(execFile);

export interface LocalDocument {
  id: number;
  fileName: string;
  relativePath: string;
  absolutePath: string;
  sha256: string;
  sizeBytes: number;
  title: string;
  snippet: string;
  indexedAt: Date;
  type: 'pdf' | 'tex';
}

export interface GeneratedArtifact {
  id: string;
  title: string;
  texPath: string;
  pdfPath?: string;
  createdAt: Date;
}

const documents = new Map<string, LocalDocument>();
const artifacts = new Map<string, GeneratedArtifact>();

function resolveDocsDir() {
  return path.resolve(process.cwd(), env.docsDir);
}

function resolveOutputDir() {
  return path.resolve(process.cwd(), env.outputDir);
}

async function walk(dir: string): Promise<string[]> {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const next = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(next));
    } else if (entry.isFile()) {
      const ext = entry.name.toLowerCase();
      if (ext.endsWith(".pdf") || ext.endsWith(".tex")) {
        files.push(next);
      }
    }
  }
  return files;
}

async function sha256(filePath: string) {
  return new Promise<string>((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function inferTitle(fileName: string) {
  return path.basename(fileName, path.extname(fileName)).replace(/[_-]+/g, " ").trim();
}

function latexEscape(value: string) {
  return value
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/&/g, "\\&")
    .replace(/%/g, "\\%")
    .replace(/\$/g, "\\$")
    .replace(/#/g, "\\#")
    .replace(/_/g, "\\_")
    .replace(/{/g, "\\{")
    .replace(/}/g, "\\}")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}");
}

export async function health() {
  const docsDir = resolveDocsDir();
  const outputDir = resolveOutputDir();
  const docsReady = await fsp.access(docsDir).then(() => true).catch(() => false);
  const outputReady = await fsp.mkdir(outputDir, { recursive: true }).then(() => true).catch(() => false);
  const ollamaReady = await fetch(`${env.ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(1500) })
    .then((res) => res.ok)
    .catch(() => false);
  return {
    docsDir,
    outputDir,
    docsReady,
    outputReady,
    ollamaUrl: env.ollamaUrl,
    ollamaReady,
    indexedDocuments: documents.size,
    generatedArtifacts: artifacts.size,
  };
}

export async function scanDocuments() {
  const docsDir = resolveDocsDir();
  const files = await walk(docsDir);
  let changed = 0;

  for (const filePath of files) {
    const stat = await fsp.stat(filePath);
    const digest = await sha256(filePath);
    const relativePath = path.relative(docsDir, filePath);
    const existing = documents.get(digest);
    if (!existing) changed += 1;
    
    const ext = path.extname(filePath).toLowerCase();
    const type = ext === ".tex" ? "tex" : "pdf";

    documents.set(digest, {
      id: documents.size + 1,
      fileName: path.basename(filePath),
      relativePath,
      absolutePath: filePath,
      sha256: digest,
      sizeBytes: stat.size,
      title: inferTitle(filePath),
      snippet: `Indexed local ${type.toUpperCase()}: ${relativePath}`,
      indexedAt: existing?.indexedAt || new Date(),
      type,
    });
  }

  return {
    scanned: files.length,
    indexed: documents.size,
    changed,
    docsDir,
  };
}

export function listDocuments() {
  return Array.from(documents.values()).sort((a, b) => a.fileName.localeCompare(b.fileName));
}

export function searchDocuments(query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return listDocuments();
  const tokens = normalized
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length >= 3)
    .filter((token) => !["what", "which", "where", "when", "available", "documents", "document", "about", "from", "local"].includes(token));

  return listDocuments().filter((doc) => {
    const haystack = [doc.fileName, doc.relativePath, doc.title, doc.snippet].join(" ").toLowerCase();
    return haystack.includes(normalized) || tokens.some((token) => haystack.includes(token));
  });
}

export async function askLocalAgent(question: string) {
  const query = question.trim();
  if (!query) throw new Error("Question is required");

  if (documents.size === 0) {
    await scanDocuments().catch(() => undefined);
  }

  const matches = searchDocuments(query).slice(0, 6);
  const context = matches.map((doc, index) => {
    return `${index + 1}. ${doc.title} (${doc.relativePath}, ${doc.sizeBytes} bytes, sha256 ${doc.sha256}, type ${doc.type})`;
  }).join("\n");

  if (env.enableLocalLlm && matches.length > 0) {
    const prompt = [
      "You are a local research agent running on a private Linux server.",
      "Answer only from the local document metadata/context below. If the context is insufficient, say what is missing.",
      "",
      "Local context:",
      context,
      "",
      `User question: ${query}`,
    ].join("\n");

    try {
      const response = await fetch(`${env.ollamaUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env.OLLAMA_MODEL || "llama3.1",
          prompt,
          stream: false,
        }),
        signal: AbortSignal.timeout(30000),
      });
      if (response.ok) {
        const data = await response.json() as { response?: string };
        if (data.response) {
          return {
            answer: data.response,
            mode: "ollama",
            matches,
          };
        }
      }
    } catch {
      // Fall through to deterministic local answer.
    }
  }

  if (matches.length === 0) {
    return {
      answer: `I did not find indexed local documents matching "${query}". Run a scan, then try a filename, acronym, topic, standard number, or report title from the local docs folder.`,
      mode: "local-search",
      matches,
    };
  }

  return {
    answer: [
      `I found ${matches.length} local document${matches.length === 1 ? "" : "s"} related to "${query}".`,
      "This first prototype uses local document metadata and filenames. Enable Ollama plus text extraction/embeddings for deeper inference over PDF contents.",
      "",
      context,
    ].join("\n"),
    mode: "local-search",
    matches,
  };
}

/**
 * Perform deep analysis on a specific document's content.
 */
export async function deepAskAboutDocument(sha256: string, question: string) {
  if (documents.size === 0) {
    await scanDocuments().catch(() => undefined);
  }

  const doc = Array.from(documents.values()).find((d) => d.sha256 === sha256);
  if (!doc) throw new Error("Document not found");
  if (doc.type !== "pdf") throw new Error("Deep analysis is only supported for PDF documents");

  try {
    const text = await extractPDFText(doc.absolutePath);
    const analysis = await analyzePDFContentWithLLM(text, question, `Document: ${doc.title}`);

    return {
      question,
      answer: analysis.answer,
      document: doc,
      confidence: analysis.confidence,
      relatedSections: analysis.relatedSections,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Deep analysis failed: ${message}`);
  }
}

/**
 * Get PDF buffer for downloading
 */
export async function getPdfBuffer(pdfPath: string): Promise<Buffer> {
  if (!fs.existsSync(pdfPath)) {
    throw new Error(`PDF file not found: ${pdfPath}`);
  }
  return await fsp.readFile(pdfPath);
}

/**
 * Get TeX buffer for downloading
 */
export async function getTexBuffer(texPath: string): Promise<Buffer> {
  if (!fs.existsSync(texPath)) {
    throw new Error(`TeX file not found: ${texPath}`);
  }
  return await fsp.readFile(texPath);
}

/**
 * Save arbitrary LaTeX content to the docs directory for agent visibility
 */
export async function saveTexToDocsDir(content: string, filename: string): Promise<string> {
  const docsDir = resolveDocsDir();
  await fsp.mkdir(docsDir, { recursive: true });
  
  // Ensure the filename ends with .tex and has no illegal characters
  const safeFilename = filename.replace(/[^a-z0-9_\-\.]/gi, '_');
  const finalFilename = safeFilename.endsWith('.tex') ? safeFilename : `${safeFilename}.tex`;
  const filePath = path.join(docsDir, finalFilename);
  
  await fsp.writeFile(filePath, content, "utf-8");
  return filePath;
}

export async function generateTexReport(documentIds: string[], title: string) {
  const selected = listDocuments().filter((doc) => documentIds.includes(doc.sha256));
  if (selected.length === 0) {
    throw new Error("No indexed local documents selected");
  }

  const outputDir = resolveOutputDir();
  await fsp.mkdir(outputDir, { recursive: true });
  
  // We also save a copy in DOCS_DIR so the agent can "see" and "re-index" it if needed
  const docsDir = resolveDocsDir();

  const artifactId = crypto.randomUUID();
  const safeFile = `${artifactId}.tex`;
  const texPath = path.join(outputDir, safeFile);
  const reportTitle = title.trim() || "Local Research Agent Document Report";

  // Also save to docs folder for agent visibility
  const visibleTexPath = path.join(docsDir, `Report_${reportTitle.replace(/\s+/g, "_")}_${artifactId.substring(0, 8)}.tex`);

  const rows = selected.map((doc, index) => [
    `\\section*{${index + 1}. ${latexEscape(doc.title)}}`,
    `\\textbf{File:} ${latexEscape(doc.relativePath)}\\\\`,
    `\\textbf{SHA-256:} \\texttt{${doc.sha256}}\\\\`,
    `\\textbf{Size:} ${doc.sizeBytes} bytes\\\\`,
    `\\textbf{Indexed:} ${latexEscape(doc.indexedAt.toISOString())}`,
  ].join("\n")).join("\n\n");

  const tex = `\\documentclass[11pt,a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[margin=1in]{geometry}
\\usepackage{hyperref}
\\title{${latexEscape(reportTitle)}}
\\author{Local Linux Research Agent}
\\date{\\today}
\\begin{document}
\\maketitle

\\section*{Indexed Local Documents}
This report was generated from the local document mount configured by \\texttt{DOCS\\_DIR}.

${rows}

\\end{document}
`;

  await fsp.writeFile(texPath, tex, "utf-8");
  await fsp.writeFile(visibleTexPath, tex, "utf-8"); // Visible to the agent
  const artifact: GeneratedArtifact = { id: artifactId, title: reportTitle, texPath, createdAt: new Date() };
  artifacts.set(artifactId, artifact);
  return artifact;
}

export async function compilePdf(artifactId: string) {
  const artifact = artifacts.get(artifactId);
  if (!artifact) throw new Error("Artifact not found");

  const outputDir = path.dirname(artifact.texPath);
  try {
    await execFileAsync("pdflatex", ["-interaction=nonstopmode", "-halt-on-error", `-output-directory=${outputDir}`, artifact.texPath], {
      timeout: 30000,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown pdflatex error";
    throw new Error(`PDF compilation failed. Ensure pdflatex is installed in the runtime. ${message}`);
  }

  const pdfPath = artifact.texPath.replace(/\.tex$/i, ".pdf");
  
  // Also save a copy of the PDF to DOCS_DIR for agent visibility
  try {
    const docsDir = resolveDocsDir();
    const visiblePdfPath = path.join(docsDir, path.basename(pdfPath));
    await fsp.copyFile(pdfPath, visiblePdfPath);
  } catch (err) {
    console.warn("Failed to copy PDF to docs directory:", err);
  }

  artifact.pdfPath = pdfPath;
  artifacts.set(artifactId, artifact);
  return artifact;
}

/**
 * Compile a local .tex file from the index to PDF
 */
export async function compileLocalTex(sha256: string) {
  const doc = Array.from(documents.values()).find((d) => d.sha256 === sha256);
  if (!doc) throw new Error("Document not found");
  if (doc.type !== "tex") throw new Error("Document is not a TeX file");

  const outputDir = resolveOutputDir();
  await fsp.mkdir(outputDir, { recursive: true });

  try {
    await execFileAsync("pdflatex", ["-interaction=nonstopmode", "-halt-on-error", `-output-directory=${outputDir}`, doc.absolutePath], {
      timeout: 30000,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown pdflatex error";
    throw new Error(`PDF compilation failed: ${message}`);
  }

  const pdfPath = path.join(outputDir, doc.fileName.replace(/\.tex$/i, ".pdf"));
  
  if (fs.existsSync(pdfPath)) {
    // Also save a copy of the PDF to DOCS_DIR for agent visibility
    try {
      const docsDir = resolveDocsDir();
      const visiblePdfPath = path.join(docsDir, path.basename(pdfPath));
      await fsp.copyFile(pdfPath, visiblePdfPath);
    } catch (err) {
      console.warn("Failed to copy PDF to docs directory:", err);
    }

    // Create an artifact for it so it shows up in the artifacts list
    const artifactId = crypto.randomUUID();
    const artifact: GeneratedArtifact = {
      id: artifactId,
      title: `Compiled: ${doc.title}`,
      texPath: doc.absolutePath,
      pdfPath: pdfPath,
      createdAt: new Date(),
    };
    artifacts.set(artifactId, artifact);
    return artifact;
  }

  throw new Error("Compilation finished but PDF not found");
}

export function listArtifacts() {
  return Array.from(artifacts.values()).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}
