import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { env } from "../lib/env";
import * as schema from "@db/schema";
import * as relations from "@db/relations";

const fullSchema = { ...schema, ...relations };

let instance: ReturnType<typeof drizzle<typeof fullSchema>>;
let sqlite: any | undefined;

export function getDb() {
  if (!instance) {
    const dbPath = env.sqliteDbPath || "./db/research.db";
    sqlite = new Database(dbPath);
    instance = drizzle(sqlite, {
      schema: fullSchema,
    });
  }
  return instance;
}

export async function closeDb() {
  if (sqlite) {
    sqlite.close();
    sqlite = undefined;
  }
}
