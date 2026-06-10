import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value && process.env.NODE_ENV === "production") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value ?? "";
}

export const env = {
  appId: required("APP_ID"),
  appSecret: required("APP_SECRET"),
  isProduction: process.env.NODE_ENV === "production",
  sqliteDbPath: process.env.SQLITE_DB_PATH || "./db/research.db",
  docsDir: process.env.DOCS_DIR || "../db",
  outputDir: process.env.OUTPUT_DIR || "./output",
  ollamaUrl: process.env.OLLAMA_URL || "http://ollama:11434",
  enableLocalLlm: process.env.ENABLE_LOCAL_LLM === "true",
  serpapiKey: process.env.SERPAPI_API_KEY || process.env.SERPAPI_KEY || "",
};
