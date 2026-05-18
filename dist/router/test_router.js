import { Hono } from "hono";
const router = new Hono();
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
router.get("/query_string", async (c) => {
    let result = { success: true };
    const db = c.var.db;
    try {
        let mydata = c.req.query("mydata");
        let mydata2 = c.req.query("mydata2");
        result.data = { mydata, mydata2 };
        return c.json(result);
    }
    catch (error) {
        result.success = false;
        result.msg = `!error. ${error?.message}`;
        return c.json(result);
    }
});
router.post("/formdata_body", async (c) => {
    let result = { success: true };
    const db = c.var.db;
    try {
        const body = await c.req.parseBody({ all: true });
        let files = body["files"];
        console.log(`file : `, files);
        let mydata = body["mydata"];
        const fileList = [];
        if (files && !Array.isArray(files)) {
            files = [files];
        }
        if (files?.length || 0) {
            for (const e of files) {
                fileList.push({
                    name: e?.name,
                    size: e?.size,
                    type: e?.type,
                });
            }
        }
        result.data = { mydata, files: fileList };
        return c.json(result);
    }
    catch (error) {
        result.success = false;
        result.msg = `!error. ${error?.message}`;
        return c.json(result);
    }
});
router.post("/json_body", async (c) => {
    let result = { success: true };
    const db = c.var.db;
    try {
        const body = await c.req.json();
        let mydata = body?.mydata;
        result.data = mydata;
        return c.json(result);
    }
    catch (error) {
        result.success = false;
        result.msg = `!error. ${error?.message}`;
        return c.json(result);
    }
});
export default router;
