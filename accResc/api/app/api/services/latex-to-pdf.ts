/**
 * LaTeX to PDF Conversion Service
 * Handles compilation of LaTeX files to PDF using pdflatex CLI
 * with dedicated output folder management.
 */

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

// ============================================================================
// Types
// ============================================================================
export interface PDFConversionResult {
  success: boolean;
  texFilePath: string;
  pdfFilePath?: string;
  message: string;
  compilationTime?: number;
  fileSize?: number;
  error?: string;
}

export interface PDFOutputConfig {
  outputDir: string;
  tempDir: string;
  cleanupTemp: boolean;
  maxCompilationAttempts: number;
}

// ============================================================================
// Configuration
// ============================================================================
export function getDefaultPDFConfig(): PDFOutputConfig {
  return {
    outputDir: process.env.PDF_OUTPUT_DIR || "./output/SAVED_PDFS",
    tempDir: process.env.LATEX_TEMP_DIR || "./output/latex-temp",
    cleanupTemp: process.env.CLEANUP_TEMP !== "false",
    maxCompilationAttempts: 3,
  };
}

// ============================================================================
// Directory Management
// ============================================================================
export function ensureOutputDirectories(config: PDFOutputConfig): boolean {
  try {
    if (!fs.existsSync(config.outputDir)) {
      fs.mkdirSync(config.outputDir, { recursive: true });
      console.log(`Created PDF output directory: ${config.outputDir}`);
    }

    if (!fs.existsSync(config.tempDir)) {
      fs.mkdirSync(config.tempDir, { recursive: true });
      console.log(`Created LaTeX temp directory: ${config.tempDir}`);
    }

    // Verify write permissions
    fs.accessSync(config.outputDir, fs.constants.W_OK);
    fs.accessSync(config.tempDir, fs.constants.W_OK);

    return true;
  } catch (error) {
    console.error("Failed to ensure output directories:", error);
    return false;
  }
}

// ============================================================================
// LaTeX Compilation
// ============================================================================
export async function compileLaTeXToPDF(
  texFilePath: string,
  outputFileName?: string,
  config?: PDFOutputConfig
): Promise<PDFConversionResult> {
  const finalConfig = config || getDefaultPDFConfig();

  // Verify output directories
  if (!ensureOutputDirectories(finalConfig)) {
    return {
      success: false,
      texFilePath,
      message: "Failed to prepare output directories",
      error: "Directory creation failed",
    };
  }

  // Verify input file exists
  if (!fs.existsSync(texFilePath)) {
    return {
      success: false,
      texFilePath,
      message: `LaTeX file not found: ${texFilePath}`,
      error: "File not found",
    };
  }

  const texFileName = path.basename(texFilePath, ".tex");
  const pdfFileName = outputFileName || `${texFileName}.pdf`;
  const pdfOutputPath = path.join(finalConfig.outputDir, pdfFileName);

  // Check for pdflatex availability
  if (!checkPdfLatexAvailable()) {
    return {
      success: false,
      texFilePath,
      message: "pdflatex not found in system PATH",
      error: "pdflatex not available",
    };
  }

  const startTime = Date.now();
  let lastError: string | undefined;

  // Attempt compilation with retries
  for (let attempt = 1; attempt <= finalConfig.maxCompilationAttempts; attempt++) {
    try {
      console.log(`Compilation attempt ${attempt}/${finalConfig.maxCompilationAttempts} for ${texFileName}`);

      const result = compileLaTeXSync(texFilePath, finalConfig);

      if (result.success) {
        const compilationTime = Date.now() - startTime;

        // Move PDF to final output directory
        const tempPdfPath = path.join(path.dirname(texFilePath), `${texFileName}.pdf`);
        if (fs.existsSync(tempPdfPath)) {
          fs.copyFileSync(tempPdfPath, pdfOutputPath);
          fs.unlinkSync(tempPdfPath);

          const stats = fs.statSync(pdfOutputPath);

          // Cleanup temporary files if configured
          if (finalConfig.cleanupTemp) {
            cleanupLatexTempFiles(path.dirname(texFilePath), texFileName);
          }

          return {
            success: true,
            texFilePath,
            pdfFilePath: pdfOutputPath,
            message: `PDF generated successfully: ${pdfFileName}`,
            compilationTime,
            fileSize: stats.size,
          };
        }
      }

      lastError = result.error;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      lastError = message;
      console.warn(`Compilation attempt ${attempt} failed: ${message}`);
    }
  }

  return {
    success: false,
    texFilePath,
    message: `Failed to compile LaTeX after ${finalConfig.maxCompilationAttempts} attempts`,
    error: lastError || "Unknown error",
  };
}

// ============================================================================
// Synchronous LaTeX Compilation (using execSync)
// ============================================================================
function compileLaTeXSync(
  texFilePath: string,
  _config: PDFOutputConfig
): { success: boolean; error?: string } {
  try {
    const texDir = path.dirname(texFilePath);
    const texFileName = path.basename(texFilePath);

    const command = `pdflatex -interaction=nonstopmode -output-directory="${texDir}" "${texFileName}"`;

    // Execute pdflatex
    const output = execSync(command, {
      cwd: texDir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 60000, // 60 second timeout
    });

    // Check if PDF was generated
    const pdfPath = path.join(texDir, texFileName.replace(".tex", ".pdf"));
    if (fs.existsSync(pdfPath)) {
      return { success: true };
    }

    // Parse error from pdflatex output
    const errorMatch = output.match(/^!(.*?)$/m);
    const error = errorMatch ? errorMatch[1] : "Unknown compilation error";

    return {
      success: false,
      error,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Compilation failed";
    return {
      success: false,
      error: message,
    };
  }
}

// ============================================================================
// Check pdflatex Availability
// ============================================================================
function checkPdfLatexAvailable(): boolean {
  try {
    const version = execSync("pdflatex --version", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return version.includes("pdfTeX");
  } catch {
    return false;
  }
}

// ============================================================================
// Cleanup Temporary Files
// ============================================================================
function cleanupLatexTempFiles(directory: string, baseName: string): void {
  const tempExtensions = [".aux", ".log", ".out", ".toc", ".lof", ".lot", ".fls", ".fdb_latexmk"];

  for (const ext of tempExtensions) {
    const filePath = path.join(directory, baseName + ext);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      console.warn(`Failed to clean up ${filePath}:`, error);
    }
  }
}

// ============================================================================
// Batch PDF Generation
// ============================================================================
export async function generatePDFBatch(
  texFiles: Array<{ texPath: string; outputName?: string }>,
  config?: PDFOutputConfig
): Promise<PDFConversionResult[]> {
  const finalConfig = config || getDefaultPDFConfig();
  const results: PDFConversionResult[] = [];

  for (const file of texFiles) {
    const result = await compileLaTeXToPDF(file.texPath, file.outputName, finalConfig);
    results.push(result);

    // Log progress
    if (result.success) {
      console.log(`✓ ${file.texPath} → ${result.pdfFilePath}`);
    } else {
      console.error(`✗ ${file.texPath} failed: ${result.error}`);
    }
  }

  return results;
}

// ============================================================================
// Get Generated PDFs List
// ============================================================================
export function listGeneratedPDFs(config?: PDFOutputConfig): Array<{
  fileName: string;
  filePath: string;
  fileSize: number;
  createdAt: Date;
}> {
  const finalConfig = config || getDefaultPDFConfig();

  if (!fs.existsSync(finalConfig.outputDir)) {
    return [];
  }

  const files = fs.readdirSync(finalConfig.outputDir);
  const pdfFiles = files.filter((f) => f.endsWith(".pdf"));

  return pdfFiles.map((fileName) => {
    const filePath = path.join(finalConfig.outputDir, fileName);
    const stats = fs.statSync(filePath);
    return {
      fileName,
      filePath,
      fileSize: stats.size,
      createdAt: stats.birthtime || stats.mtime,
    };
  });
}

// ============================================================================
// Cleanup Old PDFs
// ============================================================================
export function cleanupOldPDFs(
  daysOld: number = 7,
  config?: PDFOutputConfig
): { cleaned: string[]; errors: string[] } {
  const finalConfig = config || getDefaultPDFConfig();
  const cleaned: string[] = [];
  const errors: string[] = [];

  if (!fs.existsSync(finalConfig.outputDir)) {
    return { cleaned, errors };
  }

  const now = Date.now();
  const maxAge = daysOld * 24 * 60 * 60 * 1000;

  const files = fs.readdirSync(finalConfig.outputDir);

  for (const file of files) {
    if (!file.endsWith(".pdf")) continue;

    const filePath = path.join(finalConfig.outputDir, file);
    const stats = fs.statSync(filePath);
    const age = now - stats.mtime.getTime();

    if (age > maxAge) {
      try {
        fs.unlinkSync(filePath);
        cleaned.push(file);
      } catch (error) {
        errors.push(`Failed to delete ${file}: ${error}`);
      }
    }
  }

  return { cleaned, errors };
}

// ============================================================================
// Update .env File with PDF Config
// ============================================================================
export function updateEnvWithPDFConfig(envPath: string, config: Partial<PDFOutputConfig>): boolean {
  try {
    let envContent = "";

    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, "utf-8");
    }

    const lines = envContent.split("\n");
    const keyMap = {
      outputDir: "PDF_OUTPUT_DIR",
      tempDir: "LATEX_TEMP_DIR",
      cleanupTemp: "CLEANUP_TEMP",
    };

    const updated = new Set<string>();

    for (const [key, envKey] of Object.entries(keyMap)) {
      if (key in config) {
        const value = config[key as keyof PDFOutputConfig];
        const envLine = `${envKey}=${value}`;

        const lineIndex = lines.findIndex((l) => l.startsWith(envKey));
        if (lineIndex >= 0) {
          lines[lineIndex] = envLine;
        } else {
          lines.push(envLine);
        }

        updated.add(key);
      }
    }

    if (updated.size > 0) {
      fs.writeFileSync(envPath, lines.join("\n"));
      console.log(`Updated .env with PDF configuration: ${Array.from(updated).join(", ")}`);
      return true;
    }

    return false;
  } catch (error) {
    console.error("Failed to update .env file:", error);
    return false;
  }
}
