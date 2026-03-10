/**
 * OpenAI-compatible HTTP server using node-llama-cpp.
 *
 * Usage:
 *   node node_server.mjs --model ./models/model.gguf --port 8080 [--gpu-layers -1] [--ctx-size 2048]
 *
 * Provides:
 *   POST /v1/chat/completions   (streaming & non-streaming)
 *   GET  /v1/models
 *   GET  /health
 */

import { getLlama, LlamaChatSession } from "node-llama-cpp";
import http from "node:http";
import path from "node:path";
import { parseArgs } from "node:util";

// --------------- CLI args ---------------
const { values: args } = parseArgs({
  options: {
    model: { type: "string" },
    port: { type: "string", default: "8080" },
    host: { type: "string", default: "127.0.0.1" },
    "gpu-layers": { type: "string", default: "-1" },
    "ctx-size": { type: "string", default: "2048" },
  },
  strict: false,
});

if (!args.model) {
  console.error(
    "Usage: node node_server.mjs --model <path.gguf> [--port 8080]",
  );
  process.exit(1);
}

const MODEL_PATH = path.resolve(args.model);
const PORT = parseInt(args.port, 10);
const HOST = args.host;
const GPU_LAYERS = parseInt(args["gpu-layers"], 10);
const CTX_SIZE = parseInt(args["ctx-size"], 10);

// --------------- Load model ---------------
console.log(`Loading model: ${MODEL_PATH}`);
console.log(`GPU layers: ${GPU_LAYERS}, Context: ${CTX_SIZE}`);

const llama = await getLlama();
const model = await llama.loadModel({
  modelPath: MODEL_PATH,
  gpuLayers: GPU_LAYERS === -1 ? "auto" : GPU_LAYERS,
});

const modelName = path.basename(MODEL_PATH, ".gguf");
console.log(`Model loaded: ${modelName}`);

// --------------- Helpers ---------------
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch {
        resolve({});
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(body);
}

function makeChatId() {
  return "chatcmpl-" + Math.random().toString(36).slice(2, 14);
}

// --------------- Routes ---------------
async function handleChatCompletions(req, res) {
  const body = await readBody(req);
  const messages = body.messages || [];
  const stream = body.stream === true;
  const maxTokens = body.max_tokens || 1024;
  const temperature = body.temperature ?? 0.7;

  // Create a fresh context + session per request
  const context = await model.createContext({ contextSize: CTX_SIZE });
  const session = new LlamaChatSession({
    contextSequence: context.getSequence(),
  });

  // Build prompt from messages
  // node-llama-cpp handles chat templates automatically
  const lastUserMsg = messages.filter((m) => m.role === "user").pop();

  const prompt = lastUserMsg?.content || "";

  if (stream) {
    // SSE streaming
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    const chatId = makeChatId();
    const created = Math.floor(Date.now() / 1000);

    try {
      await session.prompt(prompt, {
        maxTokens,
        temperature,
        onTextChunk(text) {
          const chunk = {
            id: chatId,
            object: "chat.completion.chunk",
            created,
            model: modelName,
            choices: [
              {
                index: 0,
                delta: { content: text },
                finish_reason: null,
              },
            ],
          };
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        },
      });

      // Final chunk with finish_reason
      const done = {
        id: chatId,
        object: "chat.completion.chunk",
        created,
        model: modelName,
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: "stop",
          },
        ],
      };
      res.write(`data: ${JSON.stringify(done)}\n\n`);
      res.write("data: [DONE]\n\n");
    } catch (err) {
      const errChunk = {
        error: { message: err.message, type: "server_error" },
      };
      res.write(`data: ${JSON.stringify(errChunk)}\n\n`);
    }
    res.end();
  } else {
    // Non-streaming
    try {
      const response = await session.prompt(prompt, {
        maxTokens,
        temperature,
      });

      sendJson(res, 200, {
        id: makeChatId(),
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: modelName,
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: response },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
        },
      });
    } catch (err) {
      sendJson(res, 500, {
        error: { message: err.message, type: "server_error" },
      });
    }
  }

  // Dispose context after response
  await context.dispose();
}

function handleModels(_req, res) {
  sendJson(res, 200, {
    object: "list",
    data: [
      {
        id: modelName,
        object: "model",
        created: Math.floor(Date.now() / 1000),
        owned_by: "local",
      },
    ],
  });
}

function handleHealth(_req, res) {
  sendJson(res, 200, { status: "ok", model: modelName });
}

// --------------- Server ---------------
const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    return res.end();
  }

  const url = new URL(req.url, `http://${HOST}:${PORT}`);

  try {
    if (url.pathname === "/v1/chat/completions" && req.method === "POST") {
      await handleChatCompletions(req, res);
    } else if (url.pathname === "/v1/models" && req.method === "GET") {
      handleModels(req, res);
    } else if (url.pathname === "/health" && req.method === "GET") {
      handleHealth(req, res);
    } else {
      sendJson(res, 404, { error: "Not found" });
    }
  } catch (err) {
    console.error("Server error:", err);
    sendJson(res, 500, { error: { message: err.message } });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Uvicorn running on http://${HOST}:${PORT}`);
  // ↑ We print this exact string so the PocketPaw ready_pattern matches
});
