import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { ChatMessageType, HonoEnv, ResultType } from "./types/types.js";
import * as dotenv from "dotenv";
import {
  checkDatabaseConnection,
  createDbPool,
  dbMiddleware,
} from "./db/supabasevercel_db.js";
import { openApiSpec } from "./openapi.js";
import { Server } from "socket.io";

const envFile =
  process.env.NODE_ENV == "production" ? ".env.production" : ".env.development";
dotenv.config({ path: envFile });

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

const socketDbPool = createDbPool();

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

/* 이벤트 기반 
socket := 앱socket정보 */
io.on("connection", (socket) => {
  console.log(`[socket.io] connected:`, socket.id);

  /* 1:1 채팅 시작하면, 여기서 방 만들고, 유저들 가입 시키기 */
  socket.on(
    "join_room",
    async (data: { userId: string | number; receiverId: string | number }) => {
      if (!socketDbPool) {
        console.error(`!DATABASE_URL is missing`);
        socket.emit("joined_room", {
          success: false,
          msg: "DATABASE_URL is missing",
        });
        return;
      }

      const userId = Number(data?.userId);
      const receiverId = Number(data?.receiverId);
      console.log(`# join_room on. ${userId},${receiverId}`);

      // 1. 기본 값 검증
      if (
        !Number.isInteger(userId) ||
        userId <= 0 ||
        !Number.isInteger(receiverId) ||
        receiverId <= 0
      ) {
        socket.emit("joined_room", {
          success: false,
          msg: "userId 또는 receiverId가 잘못되었습니다.",
        });
        return;
      }

      // 2. 자기 자신과 채팅 방지
      if (userId === receiverId) {
        socket.emit("joined_room", {
          success: false,
          msg: "자기 자신과는 1:1 채팅방을 만들 수 없습니다.",
        });
        return;
      }

      let client: any = null;

      try {
        client = await socketDbPool.connect();
        await client.query("BEGIN");

        /**
         * 3. 유저 존재 확인
         *
         * 주의:
         * status = 'ACTIVE' 조건은 일부러 뺐음.
         * 네 DB에서 기존 유저 status가 NULL이면 여기서 터질 수 있기 때문.
         */
        const userResult = await client.query(
          `
          SELECT id
          FROM t_user
          WHERE id IN ($1, $2)
        `,
          [userId, receiverId],
        );

        if (userResult.rows.length !== 2) {
          throw new Error("존재하지 않는 유저가 포함되어 있습니다.");
        }

        /**
         * 4. 이미 두 사람이 들어가 있는 direct 방 찾기
         *
         * 핵심:
         * - room_type = 'direct'
         * - 멤버가 정확히 2명
         * - 그 2명이 userId, receiverId
         */
        const findRoomResult = await client.query(
          `
          SELECT
            r.id,
            r.room_type,
            r.title,
            r.created_at
          FROM t_chat_room r
          JOIN t_chat_room_member m
            ON m.room_id = r.id
          WHERE r.room_type = 'direct'
          GROUP BY
            r.id,
            r.room_type,
            r.title,
            r.created_at
          HAVING
            COUNT(DISTINCT m.user_id) = 2
            AND COUNT(DISTINCT CASE
              WHEN m.user_id IN ($1, $2)
              THEN m.user_id
            END) = 2
          LIMIT 1
        `,
          [userId, receiverId],
        );

        let room = findRoomResult.rows[0];

        /**
         * 5. 기존 방이 없으면 새 방 생성
         */
        if (!room) {
          const insertRoomResult = await client.query(
            `
            INSERT INTO t_chat_room (
              room_type,
              title,
              created_at
            )
            VALUES (
              'direct',
              NULL,
              NOW()
            )
            RETURNING
              id,
              room_type,
              title,
              created_at
          `,
          );

          room = insertRoomResult.rows[0];
        }

        /**
         * 6. 채팅방 멤버 등록
         *
         * ON CONFLICT를 쓰려면 DB에 아래 제약조건이 있어야 함:
         *
         * UNIQUE (room_id, user_id)
         */
        await client.query(
          `
          INSERT INTO t_chat_room_member (
            room_id,
            user_id,
            joined_at
          )
          VALUES
            ($1, $2, NOW()),
            ($1, $3, NOW())
          ON CONFLICT (room_id, user_id)
          DO NOTHING
        `,
          [room.id, userId, receiverId],
        );

        await client.query("COMMIT");

        const roomId = String(room.id);

        /**
         * 7. 현재 접속한 socket을 socket.io 방에 입장시킴
         */
        socket.join(roomId);

        console.log(
          `[socket.io] direct room joined. userId=${userId}, receiverId=${receiverId}, roomId=${roomId}`,
        );

        /**
         * 8. 클라이언트에게 roomId 반환
         */
        socket.emit("joined_room", {
          success: true,
          roomId,
          room,
          userId: String(userId),
          receiverId: String(receiverId),
          memberUserIds: [String(userId), String(receiverId)],
        });
      } catch (error: any) {
        if (client) {
          try {
            await client.query("ROLLBACK");
          } catch (rollbackError) {
            console.error("[socket.io] rollback failed:", rollbackError);
          }
        }

        console.error("[socket.io] join_room failed:", error);

        socket.emit("joined_room", {
          success: false,
          msg: error?.message ?? "join_room failed",
        });
      } finally {
        client?.release();
      }
    },
  );

  socket.on("get_messages", (data: { roomId: string }) => {
    const { roomId } = data;
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
    },
  );

  socket.on("disconnect", () => {
    console.log(`socket disconnected:`, socket.id);
  });
});
