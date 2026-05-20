import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { Pool } from "@neondatabase/serverless";
import type { ChatMessageType, HonoEnv, ResultType } from "./types/types.js";
import * as dotenv from "dotenv";
import { dbMiddleware } from "./db/supabasevercel_db.js";
import { openApiSpec } from "./openapi.js";
import { Server } from "socket.io";

const envFile =
  process.env.NODE_ENV == "production" ? ".env.production" : ".env.development";
dotenv.config({ path: envFile });

const checkDatabaseConnection = async () => {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error("[DB] Connection failed: DATABASE_URL is missing.");
    return;
  }

  const pool = new Pool({ connectionString });

  try {
    await pool.query("SELECT 1");
    console.log("[DB] Connected successfully.");
  } catch (error: any) {
    console.error(`[DB] Connection failed: ${error?.message ?? error}`);
  } finally {
    await pool.end();
  }
};

const app = new Hono<HonoEnv>();
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
  let result: ResultType = { success: true };
  try {
    return c.json(result);
  } catch (error: any) {
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

const httpServer = serve(
  {
    fetch: app.fetch,
    port: 3000,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  },
);

// 여기까지 오면 http, socket 2개다 작동하는 서버 구동 완료
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "UPDATE", "DELETE", "PUT"],
  },
});

// 임시 메모리 저장소
// 서버 재시작하면 사라짐
const chatMessages: ChatMessageType[] = [];
let messageId = 1;
/* 이벤트 기반 */
io.on("connection", (socket) => {
  console.log(`[socket.io] connected:`, socket.id);

  socket.on("join_room", (data: { roomId: string; userId: string }) => {
    const { roomId, userId } = data;
    socket.join(roomId);
    console.log(`# socket, ${userId} join room ${roomId}`);
    socket.emit("joined_room", { success: true, roomId, userId });
  });

  socket.on("get_messages", (data: { roomId: string }) => {
    const { roomId } = data;
    const roomMessages = chatMessages.filter((msg) => msg.roomId == roomId);
    socket.emit(`message_list`, roomMessages);
  });

  socket.on(
    "send_message",
    (data: {
      roomId: string;
      senderId: string;
      receiverId: string;
      text: string;
    }) => {
      const { roomId, senderId, receiverId, text } = data;
      if (!roomId || !senderId || !receiverId) {
        socket.emit(`chat_error`, {
          messages: "데이터들 잘못보냄",
        });
        return;
      }
      const newMessage: ChatMessageType = {
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
    },
  );

  socket.on("disconnect", () => {
    console.log(`socket disconnected:`, socket.id);
  });
});
