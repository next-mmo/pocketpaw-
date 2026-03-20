/**
 * Design Builder — PocketPaw Plugin Backend
 *
 * HTTP server + MCP server for AI-powered design generation.
 * Uses @json-render/core catalog to constrain AI output.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

// ─── Config ─────────────────────────────────────────────────

const argv = process.argv.slice(2);
let HOST = '127.0.0.1';
let PORT = 9900;

for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--host' && argv[i + 1]) HOST = argv[i + 1];
  if (argv[i] === '--port' && argv[i + 1]) PORT = parseInt(argv[i + 1], 10);
}

// ─── Helpers ────────────────────────────────────────────────

function json(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data));
}

async function readBody(req: IncomingMessage): Promise<Record<string, any>> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk));
    req.on('end', () => {
      try { resolve(JSON.parse(body)); } catch { resolve({}); }
    });
  });
}

// ─── Catalog prompt (describes available components for AI) ──

const CATALOG_SYSTEM_PROMPT = `You are a UI design assistant that generates JSON specs for a React Native component renderer.

## Available Components

### Layout
- **Stack**: Vertical container. Props: { direction?: "column"|"row", gap?: number, padding?: number, flex?: number, background?: string, borderRadius?: number, align?: "start"|"center"|"end"|"stretch" }. Has children.
- **ScrollView**: Scrollable container. Props: { direction?: "vertical"|"horizontal" }. Has children.

### Display
- **Text**: Text display. Props: { text: string, size?: number, weight?: "normal"|"bold"|"semibold", color?: string, align?: "left"|"center"|"right" }
- **Heading**: Section heading. Props: { text: string, level?: 1|2|3|4, color?: string }
- **Image**: Image display. Props: { uri: string, width?: number, height?: number, borderRadius?: number }
- **Badge**: Small label. Props: { text: string, variant?: "default"|"secondary"|"destructive"|"outline" }
- **Avatar**: User avatar. Props: { uri?: string, fallback: string, size?: number }
- **Separator**: Visual divider. Props: { orientation?: "horizontal"|"vertical" }
- **Skeleton**: Loading placeholder. Props: { width?: number, height?: number, borderRadius?: number }
- **Progress**: Progress bar. Props: { value: number, max?: number }
- **Icon**: Icon display. Props: { name: string, size?: number, color?: string }

### Inputs
- **Button**: Clickable button. Props: { label: string, variant?: "default"|"secondary"|"destructive"|"outline"|"ghost"|"link", size?: "default"|"sm"|"lg", action?: string }
- **Input**: Text input. Props: { placeholder?: string, value?: string, type?: "text"|"password"|"email"|"number" }
- **Textarea**: Multi-line input. Props: { placeholder?: string, value?: string, rows?: number }
- **Checkbox**: Toggle checkbox. Props: { label?: string, checked?: boolean }
- **Switch**: Toggle switch. Props: { label?: string, checked?: boolean }
- **Select**: Dropdown select. Props: { placeholder?: string, options: { label: string, value: string }[] }

### Navigation
- **Tabs**: Tab container. Props: { defaultValue?: string }. Children must be TabsList and TabsContent.
- **TabsList**: Tab bar. Has TabsTrigger children.
- **TabsTrigger**: Tab button. Props: { value: string, label: string }
- **TabsContent**: Tab content panel. Props: { value: string }. Has children.

### Overlay
- **Card**: Card container. Props: { title?: string, description?: string }. Has children.
- **Alert**: Alert message. Props: { title: string, description?: string, variant?: "default"|"destructive" }

## Spec Format

Return a JSON object with this structure:
{
  "version": "1.0",
  "root": "root",
  "state": {},
  "elements": {
    "root": {
      "type": "Stack",
      "props": { "direction": "column", "padding": 16, "gap": 12 },
      "children": ["child1", "child2"]
    },
    "child1": {
      "type": "Text",
      "props": { "text": "Hello World", "size": 24, "weight": "bold" }
    }
  }
}

## Rules
- Every element needs a unique string ID
- Root element is always "root" with type "Stack"
- Only use components listed above
- Return ONLY valid JSON, no markdown code blocks
- Generate realistic, visually appealing designs
- Use proper spacing, typography hierarchy, and color contrast
- For dark themes, use backgrounds like "#141414", text like "#e0e0e0"
`;

// ─── Saved specs storage ────────────────────────────────────

const SPECS_DIR = path.join(os.homedir(), '.pocketpaw', 'design-builder', 'specs');

async function ensureSpecsDir() {
  await fs.mkdir(SPECS_DIR, { recursive: true });
}

// ─── HTTP Server ────────────────────────────────────────────

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  const url = new URL(req.url ?? '/', `http://${HOST}:${PORT}`);
  const pathname = url.pathname;

  try {

    // ── Health ──
    if (pathname === '/health') {
      return json(res, 200, { status: 'ok', version: '0.1.0' });
    }

    // ── Catalog prompt (for the frontend to pass to AI) ──
    if (pathname === '/api/catalog-prompt') {
      return json(res, 200, { prompt: CATALOG_SYSTEM_PROMPT });
    }

    // ── AI Chat (proxy to OpenAI-compatible endpoint) ──
    if (pathname === '/api/chat' && req.method === 'POST') {
      const body = await readBody(req);
      const { messages, apiKey, apiBase, model } = body;

      if (!apiKey) return json(res, 400, { error: 'apiKey required' });

      const base = apiBase || 'https://api.openai.com/v1';
      const aiModel = model || 'gpt-4o-mini';

      // Build messages with system prompt
      const aiMessages = [
        { role: 'system', content: CATALOG_SYSTEM_PROMPT },
        ...(messages || []),
      ];

      try {
        const response = await fetch(`${base}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: aiModel,
            messages: aiMessages,
            response_format: { type: 'json_object' },
            temperature: 0.7,
          }),
        });

        if (!response.ok) {
          const err = await response.text();
          return json(res, response.status, { error: err });
        }

        const data = await response.json() as any;
        const content = data.choices?.[0]?.message?.content ?? '{}';

        let spec;
        try {
          spec = JSON.parse(content);
        } catch {
          spec = null;
        }

        return json(res, 200, {
          content,
          spec,
          usage: data.usage,
        });
      } catch (err: any) {
        return json(res, 500, { error: err.message });
      }
    }

    // ── Save spec ──
    if (pathname === '/api/specs/save' && req.method === 'POST') {
      const body = await readBody(req);
      const { name, spec } = body;
      if (!name || !spec) return json(res, 400, { error: 'name and spec required' });

      await ensureSpecsDir();
      const filePath = path.join(SPECS_DIR, `${name}.json`);
      await fs.writeFile(filePath, JSON.stringify(spec, null, 2));
      return json(res, 200, { saved: name, path: filePath });
    }

    // ── Load spec ──
    if (pathname === '/api/specs/load' && req.method === 'POST') {
      const body = await readBody(req);
      const { name } = body;
      if (!name) return json(res, 400, { error: 'name required' });

      const filePath = path.join(SPECS_DIR, `${name}.json`);
      try {
        const raw = await fs.readFile(filePath, 'utf-8');
        return json(res, 200, { spec: JSON.parse(raw) });
      } catch {
        return json(res, 404, { error: 'spec not found' });
      }
    }

    // ── List specs ──
    if (pathname === '/api/specs/list') {
      await ensureSpecsDir();
      const files = await fs.readdir(SPECS_DIR);
      const specs = files
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace('.json', ''));
      return json(res, 200, { specs });
    }

    // ── Delete spec ──
    if (pathname === '/api/specs/delete' && req.method === 'POST') {
      const body = await readBody(req);
      if (!body.name) return json(res, 400, { error: 'name required' });
      const filePath = path.join(SPECS_DIR, `${body.name}.json`);
      try {
        await fs.unlink(filePath);
        return json(res, 200, { deleted: body.name });
      } catch {
        return json(res, 404, { error: 'spec not found' });
      }
    }

    // ── Fallback ──
    json(res, 404, { error: 'Not found' });

  } catch (err: any) {
    console.error('Server error:', err);
    json(res, 500, { error: err.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Design Builder server running on http://${HOST}:${PORT}`);
});
