import { getDb } from "./api/queries/connection";
import { sql } from "drizzle-orm";

async function test() {
  try {
    const db = getDb();
    const result = await db.execute(sql`SELECT 1`);
    console.log("DB Connection OK:", result);
    process.exit(0);
  } catch (err) {
    console.error("DB Connection Failed:", err);
    process.exit(1);
  }
}

test();
