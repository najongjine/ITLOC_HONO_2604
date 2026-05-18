import { Hono } from "hono";
import type { HonoEnv, ResultType } from "../types/types.js";
import {
  hashPassword,
  generateToken,
  comparePassword,
} from "../utils/utils.js";

const router = new Hono<HonoEnv>();

router.get("/db_select_test", async (c) => {
  let result: ResultType = { success: true };
  const db = c.var.db;
  try {
    let _data = await db.query(
      `
        SELECT NOW();
        `,
      [],
    );
    result.data = _data;
    return c.json(result);
  } catch (error: any) {
    result.success = false;
    result.msg = `!error. ${error?.message}`;
    return c.json(result);
  }
});

router.get("/query_string", async (c) => {
  let result: ResultType = { success: true };
  const db = c.var.db;
  try {
    let mydata = c.req.query("mydata");
    let mydata2 = c.req.query("mydata2");
    result.data = { mydata, mydata2 };
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
    const body = await c.req.parseBody({ all: true });
    let username = String(body["username"] || "");
    username = username?.trim() || "";
    let password = String(body["password"] || "");
    password = password?.trim() || "";

    if (!username || !password) {
      result.success = false;
      result.msg = "!error. username or password is required";
      return c.json(result);
    }

    let _data = await db.query(
      `
        SELECT * FROM t_user WHERE username = $1;
        `,
      [username],
    );

    if (_data.rows.length > 0) {
      result.success = false;
      result.msg = "!error. username already exists";
      return c.json(result);
    }
    let encPassword = await hashPassword(password);
    console.log(`password: `, password);
    console.log(`encPassword: `, encPassword);
    let _data2: any = await db.query(
      `
        INSERT INTO t_user (username, password) VALUES ($1, $2)
        RETURNING *;
        `,
      [username, encPassword],
    );
    console.log(`_data2: `, _data2);
    _data2 = _data2?.rows[0] || {};
    _data2.password = "";
    const token = `Bearer ${generateToken(_data2, "999d")}`;
    console.log(`token: `, token);
    result.data = { userInfo: _data2, token: token };

    return c.json(result);
  } catch (error: any) {
    result.success = false;
    result.msg = `!error. ${error?.message}`;
    return c.json(result);
  }
});

/** username, password 가 맞으면 token 만들어서
 * register 의 응답 형식과 똑같이 해주면 되요
 */
router.post("/login", async (c) => {
  let result: ResultType = { success: true };
  const db = c.var.db;
  try {
    const body = await c.req.parseBody({ all: true });
    let username = String(body["username"] || "");
    username = username?.trim() || "";
    let password = String(body["password"] || "");
    password = password?.trim() || "";

    if (!username || !password) {
      result.success = false;
      result.msg = "!error. username or password is required";
      return c.json(result);
    }

    let _data: any = await db.query(
      `
        SELECT * FROM t_user WHERE username = $1;
        `,
      [username],
    );

    if (!_data?.rows?.length) {
      result.success = false;
      result.msg = "!error. user not found";
      return c.json(result);
    }
    _data = _data.rows[0];
    let isMatch = await comparePassword(password, _data?.password);
    if (!isMatch) {
      result.success = false;
      result.msg = "!error. invalid password";
      return c.json(result);
    }
    _data.password = "";
    const token = `Bearer ${generateToken(_data, "999d")}`;
    console.log(`token: `, token);
    result.data = { userInfo: _data, token: token };

    return c.json(result);
  } catch (error: any) {
    result.success = false;
    result.msg = `!error. ${error?.message}`;
    return c.json(result);
  }
});

export default router;
