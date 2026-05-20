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

/** username, password 가 맞으면 token 만들어서
 * register 의 응답 형식과 똑같이 해주면 되요
 */
router.post("/login_register", async (c) => {
  let result: ResultType = { success: true };
  const db = c.var.db;
  try {
    return c.json(result);
  } catch (error: any) {
    result.success = false;
    result.msg = `!error. ${error?.message}`;
    return c.json(result);
  }
});

export default router;
