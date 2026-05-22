import { createMiddleware } from "hono/factory";
import { Pool } from "@neondatabase/serverless";
import type { HonoEnv } from "../types/types.js";

export const getConnectionString = (databaseUrl?: string) => {
  return databaseUrl || process.env.DATABASE_URL;
};

export const createDbPool = (databaseUrl?: string) => {
  const connectionString = getConnectionString(databaseUrl);

  if (!connectionString) {
    return null;
  }

  return new Pool({ connectionString });
};

export const checkDatabaseConnection = async () => {
  const pool = createDbPool();

  if (!pool) {
    console.error("[DB] Connection failed: DATABASE_URL is missing.");
    return;
  }

  try {
    await pool.query("SELECT 1");
    console.log("[DB] Connected successfully.");
  } catch (error: any) {
    console.error(`[DB] Connection failed: ${error?.message ?? error}`);
  } finally {
    await pool.end();
  }
};

export const dbMiddleware = createMiddleware<HonoEnv>(async (c, next) => {
  const pool = createDbPool(c.env?.DATABASE_URL);

  if (!pool) {
    console.error("[DB] Error: DATABASE_URL is missing in .env file");
    return c.json({ error: "Server Configuration Error" }, 500);
  }

  c.set("db", pool);

  try {
    await next();
  } finally {
    try {
      if (c.executionCtx) {
        c.executionCtx.waitUntil(pool.end());
      } else {
        throw new Error("No executionCtx");
      }
    } catch (e) {
      await pool.end();
    }
  }
});
