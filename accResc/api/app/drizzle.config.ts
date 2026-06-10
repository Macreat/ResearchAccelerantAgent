import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const dbPath = process.env.SQLITE_DB_PATH || "./db/research.db";

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: dbPath,
  },
});
