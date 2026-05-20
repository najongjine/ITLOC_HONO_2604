import { Hono } from "hono";
import { generateToken } from "../utils/utils.js";
const router = new Hono();
const valueToString = (value) => {
    if (value === undefined || value === null) {
        return "";
    }
    if (Array.isArray(value)) {
        return valueToString(value[0]);
    }
    if (value instanceof File) {
        return "";
    }
    return String(value).trim();
};
const toIsoString = (value) => {
    if (!value) {
        return null;
    }
    if (value instanceof Date) {
        return value.toISOString();
    }
    return String(value);
};
router.get("/db_select_test", async (c) => {
    let result = { success: true };
    const db = c.var.db;
    try {
        let _data = await db.query(`
        SELECT NOW();
        `, []);
        result.data = _data;
        return c.json(result);
    }
    catch (error) {
        result.success = false;
        result.msg = `!error. ${error?.message}`;
        return c.json(result);
    }
});
router.post("/login_register", async (c) => {
    let result = { success: true };
    const db = c.var.db;
    try {
        const contentType = c.req.header("content-type") || "";
        const body = contentType.includes("application/json")
            ? await c.req.json()
            : await c.req.parseBody({ all: true });
        const provider = valueToString(body["provider"]);
        const firebase_uid = valueToString(body["firebase_uid"]);
        const email = valueToString(body["email"]);
        const display_name = valueToString(body["display_name"]);
        const photo_url = valueToString(body["photo_url"]);
        if (!firebase_uid) {
            result.success = false;
            result.msg = "firebase uid missing";
            return c.json(result);
        }
        if (!email) {
            result.success = false;
            result.msg = "email missing";
            return c.json(result);
        }
        const userResult = await db.query(`
        INSERT INTO t_user (
          firebase_uid,
          email,
          display_name,
          photo_url,
          provider,
          last_login_at
        )
        VALUES (
          $1,
          $2,
          NULLIF($3, ''),
          NULLIF($4, ''),
          COALESCE(NULLIF($5, ''), 'google'),
          CURRENT_TIMESTAMP
        )
        ON CONFLICT (firebase_uid)
        DO UPDATE SET
          email = EXCLUDED.email,
          display_name = EXCLUDED.display_name,
          photo_url = EXCLUDED.photo_url,
          provider = EXCLUDED.provider,
          last_login_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        RETURNING
          id,
          firebase_uid,
          email,
          display_name,
          photo_url,
          provider,
          role,
          status,
          last_login_at,
          created_at,
          updated_at
      `, [firebase_uid, email, display_name, photo_url, provider]);
        const row = userResult?.rows?.[0];
        if (!row) {
            result.success = false;
            result.msg = "login register failed";
            return c.json(result);
        }
        const data = {
            id: row.id,
            firebase_uid: row.firebase_uid,
            email: row.email,
            display_name: row.display_name,
            photo_url: row.photo_url,
            provider: row.provider,
            role: row.role,
            status: row.status,
            last_login_at: toIsoString(row.last_login_at),
            created_at: toIsoString(row.created_at),
            updated_at: toIsoString(row.updated_at),
        };
        const access_token = generateToken(data);
        result.data = {
            access_token,
            user: data,
        };
        return c.json(result);
    }
    catch (error) {
        result.success = false;
        result.msg = `!error. ${error?.message}`;
        return c.json(result);
    }
});
export default router;
