import { Hono } from "hono";
import type { HonoEnv, ResultType } from "../types/types.js";
import {
  generateToken,
  hashPassword,
  comparePassword,
  verifyToken,
} from "../utils/utils.js";

const router = new Hono<HonoEnv>();

const valueToString = (value: unknown): string => {
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

const toIsoString = (value: unknown): string | null => {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value);
};

router.get("/get_user_list", async (c) => {
  let result: ResultType = { success: true };
  const db = c.var.db;
  try {
    let _data = await db.query(
      `
        SELECT
        id,
        username,
        display_name,
        created_at
        FROM t_user
        ORDER BY display_name
        LIMIT 1000
        `,
      [],
    );
    result.data = _data?.rows || [];
    return c.json(result);
  } catch (error: any) {
    result.success = false;
    result.msg = `!error. ${error?.message}`;
    return c.json(result);
  }
});

router.post("/register", async (c) => {
  let result: ResultType = { success: true };
  const db = c.var.db;
  try {
    const contentType = c.req.header("content-type") || "";
    const body = contentType.includes("application/json")
      ? await c.req.json()
      : await c.req.parseBody({ all: true });

    const username = valueToString(body["username"]);
    const password = valueToString(body["password"]);
    const display_name = valueToString(body["display_name"]);

    if (!username || !password) {
      result.success = false;
      result.msg = "데이터들 안보냄";
      return c.json(result);
    }

    let existUser: any = await db.query(
      `
      SELECT * FROM t_user WHERE username=$1
      LIMIT 1
      `,
      [username],
    );
    existUser = existUser?.rows?.[0];
    console.log(`# existUser: `, existUser);
    if (existUser?.id) {
      result.success = false;
      result.msg = "이미 있는 회원";
      return c.json(result);
    }

    const hashedPassword = await hashPassword(password);

    const userResult = await db.query(
      `
        INSERT INTO t_user (
         username,
         password,
         display_name
        )
        VALUES (
          $1,
          $2,
          NULLIF($3, '')
        )
        RETURNING
          id,
          username,
          display_name
      `,
      [username, hashedPassword, display_name],
    );

    const row = userResult?.rows?.[0];
    if (!row) {
      result.success = false;
      result.msg = "login register failed";
      return c.json(result);
    }

    const data = {
      id: row?.id,
      username: row?.username,
      display_name: row?.display_name,
    };
    console.log(`# after insert data: `, data);

    const access_token = generateToken(data);
    result.data = {
      access_token,
      user: data,
    };

    return c.json(result);
  } catch (error: any) {
    result.success = false;
    result.msg = `!error. ${error?.message}`;
    return c.json(result);
  }
});

router.post("/login", async (c) => {
  let result: ResultType = { success: true };
  const db = c.var.db;
  try {
    const contentType = c.req.header("content-type") || "";
    const body = contentType.includes("application/json")
      ? await c.req.json()
      : await c.req.parseBody({ all: true });

    const username = valueToString(body["username"]);
    const password = valueToString(body["password"]);

    if (!username || !password) {
      result.success = false;
      result.msg = "데이터들 안보냄";
      return c.json(result);
    }

    let existUser: any = await db.query(
      `
      SELECT * FROM t_user WHERE username=$1
      LIMIT 1
      `,
      [username],
    );
    existUser = existUser?.rows?.[0];
    console.log(`# existUser: `, existUser);
    if (!existUser?.id) {
      result.success = false;
      result.msg = "없는 회원";
      return c.json(result);
    }
    const bPassCheck = await comparePassword(
      password,
      existUser?.password || "",
    );
    if (!bPassCheck) {
      result.success = false;
      result.msg = "비번 틀림";
      return c.json(result);
    }

    const data = {
      id: existUser?.id,
      username: existUser?.username,
      display_name: existUser?.display_name,
    };
    console.log(`# after insert data: `, data);

    const access_token = generateToken(data);
    result.data = {
      access_token,
      user: data,
    };

    return c.json(result);
  } catch (error: any) {
    result.success = false;
    result.msg = `!error. ${error?.message}`;
    return c.json(result);
  }
});

router.post("/validate_token", async (c) => {
  let result: ResultType = { success: true };
  try {
    const authHeader = c.req.header("Authorization");
    let token = "";

    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1] || "";
    } else {
      const contentType = c.req.header("content-type") || "";
      const body = contentType.includes("application/json")
        ? await c.req.json()
        : await c.req.parseBody({ all: true });
      token = valueToString(body["access_token"] || body["token"]);
    }

    if (!token) {
      result.success = false;
      result.msg = "토큰이 없습니다.";
      return c.json(result);
    }

    const userData: any = verifyToken(token);
    console.log(`# userData: `, userData);
    if (!userData?.id) {
      result.success = false;
      result.msg = "유효하지 않은 토큰입니다.";
      return c.json(result);
    }

    result.data = {
      valid: true,
      user: {
        id: userData?.id,
        username: userData?.username,
        display_name: userData?.display_name,
      },
      exp: userData?.exp,
      iat: userData?.iat,
    };

    return c.json(result);
  } catch (error: any) {
    result.success = false;
    result.msg = `!error. ${error?.message}`;
    return c.json(result);
  }
});

export default router;
