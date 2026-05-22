import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import * as dotenv from "dotenv";
import { checkDatabaseConnection, createDbPool, dbMiddleware, } from "./db/supabasevercel_db.js";
import { openApiSpec } from "./openapi.js";
import { Server } from "socket.io";
const envFile = process.env.NODE_ENV == "production" ? ".env.production" : ".env.development";
dotenv.config({ path: envFile });
const app = new Hono();
app.use("*", cors()); // cors 허용
app.get("/openapi.json", (c) => {
    return c.json(openApiSpec);
});
app.get("/docs", (c) => {
    return c.html(`<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>ITLOC Hono API Docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
    <style>
      body {
        margin: 0;
        background: #f6f7f9;
      }
      .swagger-ui .topbar {
        display: none;
      }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.onload = () => {
        window.ui = SwaggerUIBundle({
          url: "/openapi.json",
          dom_id: "#swagger-ui",
          deepLinking: true,
          displayRequestDuration: true,
          persistAuthorization: true,
        });
      };
    </script>
  </body>
</html>`);
});
app.use("*", dbMiddleware);
//http://localhost:3000
app.get("/", (c) => {
    return c.text("Hello Hono!");
});
app.get("/test", (c) => {
    let result = { success: true };
    try {
        return c.json(result);
    }
    catch (error) {
        result.success = false;
        result.msg = `!error. ${error?.message}`;
        return c.json(result);
    }
});
import testRouter from "./router/test_router.js";
app.route("/api/test", testRouter);
import userRouter from "./router/user_router.js";
app.route("/api/user", userRouter);
import boardRouter from "./router/board_router.js";
app.route("/api/board", boardRouter);
import boardRouterV2 from "./router/board_router_v2.js";
app.route("/api/board_v2", boardRouterV2);
import embeddingRouter from "./router/embedding_router.js";
app.route("/api/embedding", embeddingRouter);
await checkDatabaseConnection();
const socketDbPool = createDbPool();
const httpServer = serve({
    fetch: app.fetch,
    port: 3000,
}, (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
});
// 여기까지 오면 http, socket 2개다 작동하는 서버 구동 완료
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST", "UPDATE", "DELETE", "PUT"],
    },
});
// 임시 메모리 저장소
// 서버 재시작하면 사라짐
const chatMessages = [];
let messageId = 1;
/* 이벤트 기반
socket := 앱socket정보 */
io.on("connection", (socket) => {
    console.log(`[socket.io] connected:`, socket.id);
    /* 1:1 채팅 시작하면, 여기서 방 만들고, 유저들 가입 시키기 */
    socket.on("join_room", async (data) => {
        if (!socketDbPool) {
            socket.emit("joined_room", {
                success: false,
                msg: "DATABASE_URL is missing",
            });
            return;
        }
        const userId = Number(data?.userId);
        const roomId = data?.roomId ? Number(data.roomId) : null;
        const inviteUserIds = [
            userId,
            Number(data?.receiverId),
            ...(data?.userIds ?? []).map((id) => Number(id)),
        ].filter((id, index, ids) => {
            return Number.isInteger(id) && id > 0 && ids.indexOf(id) == index;
        });
        if (!Number.isInteger(userId) || userId <= 0) {
            socket.emit("joined_room", {
                success: false,
                msg: "userId is invalid",
            });
            return;
        }
        const roomType = data?.roomType == "group" ? "group" : "direct";
        let client = null;
        try {
            client = await socketDbPool.connect();
            await client.query("BEGIN");
            let joinedRoom = null;
            if (roomId && Number.isInteger(roomId) && roomId > 0) {
                const roomResult = await client.query(`
              SELECT id, room_type, title, created_at
              FROM t_chat_room
              WHERE id = $1
              LIMIT 1
            `, [roomId]);
                joinedRoom = roomResult?.rows?.[0];
                if (!joinedRoom) {
                    throw new Error("chat room not found");
                }
            }
            else if (roomType == "direct" && inviteUserIds.length == 2) {
                const roomResult = await client.query(`
              SELECT r.id, r.room_type, r.title, r.created_at
              FROM t_chat_room r
              JOIN t_chat_room_member m ON m.room_id = r.id
              WHERE r.room_type = 'direct'
              GROUP BY r.id, r.room_type, r.title, r.created_at
              HAVING
                COUNT(DISTINCT m.user_id) = 2
                AND COUNT(DISTINCT CASE
                  WHEN m.user_id = ANY($1::int[]) THEN m.user_id
                END) = 2
              LIMIT 1
            `, [inviteUserIds]);
                joinedRoom = roomResult?.rows?.[0];
                if (!joinedRoom) {
                    const insertRoomResult = await client.query(`
                INSERT INTO t_chat_room (
                  room_type,
                  title
                )
                VALUES (
                  $1,
                  NULLIF($2, '')
                )
                RETURNING id, room_type, title, created_at
              `, [roomType, data?.title?.trim() ?? ""]);
                    joinedRoom = insertRoomResult?.rows?.[0];
                }
            }
            else {
                const roomResult = await client.query(`
              INSERT INTO t_chat_room (
                room_type,
                title
              )
              VALUES (
                $1,
                NULLIF($2, '')
              )
              RETURNING id, room_type, title, created_at
            `, [roomType, data?.title?.trim() ?? ""]);
                joinedRoom = roomResult?.rows?.[0];
            }
            for (const memberUserId of inviteUserIds) {
                await client.query(`
              INSERT INTO t_chat_room_member (
                room_id,
                user_id
              )
              VALUES (
                $1,
                $2
              )
              ON CONFLICT (room_id, user_id)
              DO NOTHING
            `, [joinedRoom.id, memberUserId]);
            }
            await client.query("COMMIT");
            const socketRoomId = String(joinedRoom.id);
            socket.join(socketRoomId);
            console.log(`# socket, ${userId} join room ${socketRoomId}`);
            socket.emit("joined_room", {
                success: true,
                roomId: socketRoomId,
                userId: String(userId),
                room: joinedRoom,
                memberUserIds: inviteUserIds.map((id) => String(id)),
            });
        }
        catch (error) {
            if (client) {
                await client.query("ROLLBACK");
            }
            console.error(`[socket.io] join_room failed:`, error);
            socket.emit("joined_room", {
                success: false,
                msg: error?.message ?? "join_room failed",
            });
        }
        finally {
            client?.release();
        }
    });
    socket.on("get_messages", (data) => {
        const { roomId } = data;
        const roomMessages = chatMessages.filter((msg) => msg.roomId == roomId);
        socket.emit(`message_list`, roomMessages);
    });
    socket.on("send_message", (data) => {
        const { roomId, senderId, receiverId, text } = data;
        if (!roomId || !senderId || !receiverId) {
            socket.emit(`chat_error`, {
                messages: "데이터들 잘못보냄",
            });
            return;
        }
        const newMessage = {
            id: messageId++,
            roomId,
            senderId,
            receiverId,
            text: text.trim(),
            createdDt: new Date().toISOString(),
        };
        chatMessages.push(newMessage);
        console.log("# new message:", newMessage);
        // 같은 방에 있는 모든 사람에게 메시지 전송
        io.to(roomId).emit("receive_message", newMessage);
    });
    socket.on("disconnect", () => {
        console.log(`socket disconnected:`, socket.id);
    });
});
