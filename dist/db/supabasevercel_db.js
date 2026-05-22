import { createMiddleware } from "hono/factory";
import { Pool } from "@neondatabase/serverless";
export const getConnectionString = (databaseUrl) => {
    return databaseUrl || process.env.DATABASE_URL;
};
export const createDbPool = (databaseUrl) => {
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
    }
    catch (error) {
        console.error(`[DB] Connection failed: ${error?.message ?? error}`);
    }
    finally {
        await pool.end();
    }
};
export const dbMiddleware = createMiddleware(async (c, next) => {
    const pool = createDbPool(c.env?.DATABASE_URL);
    if (!pool) {
        console.error("[DB] Error: DATABASE_URL is missing in .env file");
        return c.json({ error: "Server Configuration Error" }, 500);
    }
    c.set("db", pool);
    try {
        await next();
    }
    finally {
        try {
            if (c.executionCtx) {
                c.executionCtx.waitUntil(pool.end());
            }
            else {
                throw new Error("No executionCtx");
            }
        }
        catch (e) {
            await pool.end();
        }
    }
});
