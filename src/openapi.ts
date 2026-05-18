export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "ITLOC Hono API",
    version: "1.0.0",
    description: "Hono API documentation",
  },
  servers: [
    {
      url: "http://localhost:3000",
      description: "Local server",
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
    schemas: {
      Result: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          data: { nullable: true },
          msg: { type: "string", example: "!error. message" },
        },
        required: ["success"],
      },
    },
  },
  paths: {
    "/": {
      get: {
        tags: ["Default"],
        summary: "Server health text",
        responses: {
          "200": { description: "OK" },
        },
      },
    },
    "/test": {
      get: {
        tags: ["Default"],
        summary: "Simple JSON health check",
        responses: {
          "200": { description: "OK" },
        },
      },
    },
    "/api/test/db_select_test": {
      get: {
        tags: ["Test"],
        summary: "Database SELECT NOW test",
        responses: { "200": { description: "OK" } },
      },
    },
    "/api/test/query_string": {
      get: {
        tags: ["Test"],
        summary: "Query string test",
        parameters: [
          { name: "mydata", in: "query", schema: { type: "string" } },
          { name: "mydata2", in: "query", schema: { type: "string" } },
        ],
        responses: { "200": { description: "OK" } },
      },
    },
    "/api/test/formdata_body": {
      post: {
        tags: ["Test"],
        summary: "FormData body test",
        requestBody: {
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                properties: {
                  mydata: { type: "string" },
                  files: {
                    type: "array",
                    items: { type: "string", format: "binary" },
                  },
                },
              },
            },
          },
        },
        responses: { "200": { description: "OK" } },
      },
    },
    "/api/test/json_body": {
      post: {
        tags: ["Test"],
        summary: "JSON body test",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { mydata: { type: "string" } },
              },
            },
          },
        },
        responses: { "200": { description: "OK" } },
      },
    },
    "/api/user/register": {
      post: {
        tags: ["User"],
        summary: "Register user",
        requestBody: {
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["username", "password"],
                properties: {
                  username: { type: "string" },
                  password: { type: "string", format: "password" },
                },
              },
            },
          },
        },
        responses: { "200": { description: "OK" } },
      },
    },
    "/api/user/login": {
      post: {
        tags: ["User"],
        summary: "Login user",
        requestBody: {
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["username", "password"],
                properties: {
                  username: { type: "string" },
                  password: { type: "string", format: "password" },
                },
              },
            },
          },
        },
        responses: { "200": { description: "OK" } },
      },
    },
    "/api/board/upsert": {
      post: {
        tags: ["Board"],
        summary: "Create board post",
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["title", "content"],
                properties: {
                  title: { type: "string" },
                  content: { type: "string" },
                },
              },
            },
          },
        },
        responses: { "200": { description: "OK" } },
      },
    },
    "/api/board_v2/get_memo": {
      get: {
        tags: ["Board V2"],
        summary: "Get memo list",
        responses: { "200": { description: "OK" } },
      },
    },
    "/api/board_v2/get_memo_by_id": {
      get: {
        tags: ["Board V2"],
        summary: "Get memo by id",
        parameters: [{ name: "id", in: "query", schema: { type: "number" } }],
        responses: { "200": { description: "OK" } },
      },
    },
    "/api/board_v2/upsert": {
      post: {
        tags: ["Board V2"],
        summary: "Create or update memo",
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["title", "html", "json"],
                properties: {
                  id: { type: "number", example: 0 },
                  title: { type: "string" },
                  html: { type: "string" },
                  json: { type: "object" },
                },
              },
            },
          },
        },
        responses: { "200": { description: "OK" } },
      },
    },
    "/api/board_v2/delete_by_id": {
      post: {
        tags: ["Board V2"],
        summary: "Delete memo by id",
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["id"],
                properties: { id: { type: "number" } },
              },
            },
          },
        },
        responses: { "200": { description: "OK" } },
      },
    },
    "/api/embedding/insert_embedding": {
      post: {
        tags: ["Embedding"],
        summary: "Insert text embedding",
        requestBody: {
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["title", "content"],
                properties: {
                  title: { type: "string" },
                  content: { type: "string" },
                },
              },
            },
          },
        },
        responses: { "200": { description: "OK" } },
      },
    },
    "/api/embedding/insert_image_embedding": {
      post: {
        tags: ["Embedding"],
        summary: "Insert image embedding",
        requestBody: {
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["file"],
                properties: { file: { type: "string", format: "binary" } },
              },
            },
          },
        },
        responses: { "200": { description: "OK" } },
      },
    },
    "/api/embedding/search_embedding": {
      get: {
        tags: ["Embedding"],
        summary: "Search text embedding",
        parameters: [
          { name: "query", in: "query", required: true, schema: { type: "string" } },
        ],
        responses: { "200": { description: "OK" } },
      },
    },
    "/api/embedding/search_image": {
      post: {
        tags: ["Embedding"],
        summary: "Search similar image",
        requestBody: {
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["file"],
                properties: { file: { type: "string", format: "binary" } },
              },
            },
          },
        },
        responses: { "200": { description: "OK" } },
      },
    },
  },
} as const;
