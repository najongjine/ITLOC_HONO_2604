import { Hono } from "hono";
import { hashPassword, generateToken, comparePassword, verifyToken, } from "../utils/utils.js";
const router = new Hono();
router.get("/get_memo_by_id", async (c) => {
    let result = { success: true };
    const db = c.var.db;
    try {
        let id = Number(c.req.query("id") || 0);
        let _data = await db.query(`
        SELECT
        b.id
        ,b.user_id as "userId"
        ,b.title
        ,b.content
        ,b.created_dt as "createdDt"
        ,b.updated_dt as "updatedDt"
        ,b.html as "htmlContent"
        ,b.json as "jsonContent"
        ,u.username
        FROM t_board as b
        LEFT JOIN t_user as u ON u.id=b.user_id
        WHERE b.id = $1
        ORDER BY b.id DESC
        
        `, [id]);
        _data = _data.rows[0] || {};
        result.data = _data;
        return c.json(result);
    }
    catch (error) {
        result.success = false;
        result.msg = `!error. ${error?.message}`;
        return c.json(result);
    }
});
router.get("/get_memo", async (c) => {
    let result = { success: true };
    const db = c.var.db;
    try {
        let id = Number(c.req.query("id") || 0);
        let _data = await db.query(`
        SELECT
        b.id
        ,b.user_id as "userId"
        ,b.title
        ,b.content
        ,b.created_dt as "createdDt"
        ,b.updated_dt as "updatedDt"
        ,b.html as "htmlContent"
        ,b.json as "jsonContent"
        ,u.username
        FROM t_board as b
        LEFT JOIN t_user as u ON u.id=b.user_id
        ORDER BY b.id DESC
        LIMIT 5000
        `, []);
        _data = _data.rows || [];
        result.data = _data;
        return c.json(result);
    }
    catch (error) {
        result.success = false;
        result.msg = `!error. ${error?.message}`;
        return c.json(result);
    }
});
/** username, password 가 맞으면 token 만들어서
 * register 의 응답 형식과 똑같이 해주면 되요
 */
router.post("/upsert", async (c) => {
    let result = { success: true };
    const db = c.var.db;
    try {
        const authHeader = c.req.header("Authorization");
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            result.success = false;
            result.msg = "!error. 토큰이 유효하지 않습니다(Header).";
            return c.json(result);
        }
        const token = authHeader.split(" ")[1];
        let userData = verifyToken(token);
        if (!userData) {
            result.success = false;
            result.msg = "!error. 토큰이 유효하지 않습니다(verify).";
            return c.json(result);
        }
        const body = await c?.req?.json();
        let id = Number(body?.id ?? 0);
        let title = String(body?.title ?? "");
        title = title?.trim() || "";
        let html = String(body?.html ?? "");
        html = html?.trim() || "";
        let json = body?.json ?? null; // JSON 객체
        console.log(`title: `, title);
        console.log(`html: `, html);
        console.log(`json: `, json);
        if (!title || !html || !json) {
            result.success = false;
            result.msg = "!error. 제목과 내용은 필수로 입력 해야되요";
            return c.json(result);
        }
        /* id ==0 일때는 insert, 아니면 update */
        let _data;
        if (id > 0) {
            // ✅ UPDATE: content 제외, 파라미터 순서 재정렬 ($1 ~ $5)
            const updateQuery = `
    UPDATE t_board SET 
        title = $1, 
        html = $2, 
        json = $3,
        updated_dt = NOW() 
    WHERE id = $4 AND user_id = $5
    RETURNING *;
  `;
            // 순서: title, html, json, id, user_id
            _data = await db.query(updateQuery, [
                title,
                html,
                json,
                id,
                userData?.id,
            ]);
        }
        else {
            // ✅ INSERT: content 제외, 파라미터 순서 재정렬 ($1 ~ $4)
            const insertQuery = `
    INSERT INTO t_board (title, html, json, user_id, created_dt) 
    VALUES ($1, $2, $3, $4, NOW())
    RETURNING *;
  `;
            // 순서: title, html, json, user_id
            _data = await db.query(insertQuery, [title, html, json, userData?.id]);
        }
        console.log(`# _data: `, _data.rows);
        if (!_data?.rows?.length) {
            result.success = false;
            result.msg = "!error. 게시글 작성 실패";
            return c.json(result);
        }
        _data = _data?.rows[0] || {};
        result.data = _data;
        return c.json(result);
    }
    catch (error) {
        result.success = false;
        result.msg = `!error. ${error?.message}`;
        return c.json(result);
    }
});
router.post("/delete_by_id", async (c) => {
    let result = { success: true };
    const db = c.var.db;
    try {
        const authHeader = c.req.header("Authorization");
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            result.success = false;
            result.msg = "!error. 토큰이 유효하지 않습니다(Header).";
            return c.json(result);
        }
        const token = authHeader.split(" ")[1];
        let userData = verifyToken(token);
        if (!userData) {
            result.success = false;
            result.msg = "!error. 토큰이 유효하지 않습니다(verify).";
            return c.json(result);
        }
        const body = await c?.req?.json();
        let id = Number(body?.id ?? 0);
        let _data = await db.query(`
        SELECT
        b.id
        ,b.user_id as "userId"
        ,b.title
        ,b.content
        ,b.created_dt as "createdDt"
        ,b.updated_dt as "updatedDt"
        ,b.html as "htmlContent"
        ,b.json as "jsonContent"
        ,u.username
        FROM t_board as b
        LEFT JOIN t_user as u ON u.id=b.user_id
        WHERE b.id = $1
        ORDER BY b.id DESC
        
        `, [id]);
        _data = _data.rows[0] || {};
        if ((userData?.id || -1) != (_data?.userId || -2)) {
            result.success = false;
            result.msg = "!error. 사용자 검증 실패.";
            return c.json(result);
        }
        let _data2 = await db.query(`
       DELETE FROM t_board
       WHERE id = $1
            RETURNING *;
        `, [id]);
        return c.json(result);
    }
    catch (error) {
        result.success = false;
        result.msg = `!error. ${error?.message}`;
        return c.json(result);
    }
});
export default router;
