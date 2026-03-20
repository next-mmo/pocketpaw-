/**
 * Agent CLI — PocketPaw Plugin HTTP Server
 *
 * Thin HTTP layer over the modular agent-cli source.
 * Imports directly from src/ modules — scanner, rc, targets, gitignore.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { scanAgentsDir, mergeConfigs } from './src/scanner.js';
import { loadRc } from './src/rc.js';
import { ensureGitignore } from './src/gitignore.js';
import { detectInstalledTools, getTarget, isTargetName, targets, targetNames } from './src/targets/registry.js';
import { pathExists } from './src/utils/files.js';
import type { Scope, AgentsConfig, McpServer } from './src/types.js';

// ─── Config ─────────────────────────────────────────────────

const argv = process.argv.slice(2);
let HOST = '127.0.0.1';
let PORT = 9800;

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

async function readFileOrNull(filePath: string): Promise<string | null> {
  try { return await fs.readFile(filePath, 'utf-8'); } catch { return null; }
}

// ─── Merged config helper ───────────────────────────────────

async function getFullConfig(cwd: string) {
  const home = os.homedir();
  const globalConfig = await scanAgentsDir(path.join(home, '.agents'));
  const workspaceConfig = await scanAgentsDir(path.join(cwd, '.agents'));
  const merged = mergeConfigs(globalConfig, workspaceConfig);
  return { globalConfig, workspaceConfig, merged };
}

// ─── HTTP Server ────────────────────────────────────────────

const server = createServer(async (req, res) => {
  // CORS preflight
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
      return json(res, 200, { status: 'ok', version: '1.0.0' });
    }

    // ── Home dir ──
    if (pathname === '/api/home') {
      return json(res, 200, { home: os.homedir(), cwd: process.cwd() });
    }

    // ── Status — full project scan ──
    if (pathname === '/api/status' && req.method === 'POST') {
      const body = await readBody(req);
      const cwd = body.cwd || process.cwd();
      const home = os.homedir();

      const { globalConfig, workspaceConfig, merged } = await getFullConfig(cwd);
      const ides = await detectInstalledTools(home, cwd);
      const { rc, filePath: rcPath } = await loadRc(cwd);

      return json(res, 200, {
        global: {
          skills: globalConfig.skills.map(s => ({ name: s.name, description: s.description })),
          workflows: globalConfig.workflows.map(w => ({ name: w.name, description: w.description })),
        },
        workspace: {
          skills: workspaceConfig.skills.map(s => ({ name: s.name, description: s.description })),
          workflows: workspaceConfig.workflows.map(w => ({ name: w.name, description: w.description })),
          mcpServers: merged.mcpServers,
        },
        ides,
        rc: { config: rc, filePath: rcPath },
      });
    }

    // ── Init — scaffold .agents/ ──
    if (pathname === '/api/init' && req.method === 'POST') {
      const body = await readBody(req);
      const cwd = body.cwd || process.cwd();
      const projectName = body.name || path.basename(cwd);
      const force = body.force || false;

      const files = [
        {
          rel: '.agents/AGENTS.md',
          content: `# ${projectName}\n\n## Project Structure\n\nDescribe your project structure here.\n\n- \`src/\` — Source code\n- \`tests/\` — Test files\n- \`.agents/\` — Universal AI agent configuration\n\n## Conventions\n\n- Add your coding conventions here\n- Example: Use **TypeScript** everywhere\n\n## Key Packages\n\n| Package | Description |\n|---------|-------------|\n| \`your-package\` | Description here |\n`,
        },
        {
          rel: '.agents/SKILLS.md',
          content: `# Skills\n\nAvailable skills for this project. Skills are specialized instructions that extend AI capabilities.\n\n> Add skills with \`agent-cli convert\` or create them manually in \`.agents/skills/<name>/SKILL.md\`\n\n<!-- Skills will be listed here as you add them -->\n`,
        },
        {
          rel: '.agents/mcp.json',
          content: JSON.stringify({ mcpServers: {} }, null, 2) + '\n',
        },
        {
          rel: '.agentrc',
          content: JSON.stringify({
            targets: [],
            scope: 'workspace',
            gitignore: true,
            mcp: true,
            rootFiles: ['AGENTS.md', 'SKILLS.md'],
          }, null, 2) + '\n',
        },
      ];

      const created: string[] = [];
      const skipped: string[] = [];

      for (const file of files) {
        const absPath = path.join(cwd, file.rel);
        const exists = await pathExists(absPath);
        if (exists && !force) { skipped.push(file.rel); continue; }
        await fs.mkdir(path.dirname(absPath), { recursive: true });
        await fs.writeFile(absPath, file.content);
        created.push(file.rel);
      }

      for (const dir of ['.agents/skills', '.agents/workflows']) {
        const absDir = path.join(cwd, dir);
        if (!(await pathExists(absDir))) await fs.mkdir(absDir, { recursive: true });
      }

      return json(res, 200, { created, skipped });
    }

    // ── Sync — generate IDE configs from .agents/ ──
    if (pathname === '/api/sync' && req.method === 'POST') {
      const body = await readBody(req);
      const cwd = body.cwd || process.cwd();
      const home = os.homedir();
      const targetArg: string = body.target || 'all';
      const scopeArg: Scope | undefined = body.scope;
      const dryRun = body.dryRun || false;

      const { rc } = await loadRc(cwd);
      const { globalConfig, workspaceConfig, merged } = await getFullConfig(cwd);

      // Resolve targets
      let targetList: string[];
      if (targetArg === 'all') {
        const detected = await detectInstalledTools(home, cwd);
        targetList = detected.filter(t => t.detected).map(t => t.name);
      } else if (rc.targets && rc.targets.length > 0 && targetArg === '_rc') {
        targetList = rc.targets;
      } else {
        targetList = [targetArg];
      }

      // Copy root files
      const rootResults: { file: string; action: string }[] = [];
      const rootFileMap: Record<string, string | null> = {
        'AGENTS.md': merged.agentsmd,
        'SKILLS.md': merged.skillsmd,
      };

      for (const name of (rc.rootFiles ?? ['AGENTS.md', 'SKILLS.md'])) {
        const content = rootFileMap[name];
        if (!content) continue;
        const absPath = path.join(cwd, name);
        let existing: string | null = null;
        try { existing = await fs.readFile(absPath, 'utf-8'); } catch {}

        if (existing === content) {
          rootResults.push({ file: name, action: 'unchanged' });
        } else if (!dryRun) {
          await fs.writeFile(absPath, content);
          rootResults.push({ file: name, action: existing === null ? 'created' : 'updated' });
        } else {
          rootResults.push({ file: name, action: existing === null ? 'would create' : 'would update' });
        }
      }

      // Sync each target
      const targetResults: {
        target: string;
        scope: Scope;
        files: { path: string; action: string }[];
        gitignore?: boolean;
      }[] = [];

      for (const targetName of targetList) {
        if (!isTargetName(targetName)) continue;
        const target = getTarget(targetName as any);
        const scope: Scope = scopeArg ?? (rc.scope as Scope) ?? target.defaultScope;

        const targetConfig = (rc.mcp !== false) ? merged : { ...merged, mcpServers: {} };
        const generated = target.generate(targetConfig, scope);
        const fileResults: { path: string; action: string }[] = [];

        // Gitignore
        let gitignoreModified = false;
        if (rc.gitignore !== false && scope === 'workspace' && target.gitignoreEntries.length > 0 && !dryRun) {
          const result = await ensureGitignore(cwd, target.gitignoreEntries);
          gitignoreModified = result.modified;
        }

        for (const file of generated) {
          const absPath = path.join(cwd, file.relativePath);
          let existing: string | null = null;
          try { existing = await fs.readFile(absPath, 'utf-8'); } catch {}

          if (existing === file.content) {
            fileResults.push({ path: file.relativePath, action: 'unchanged' });
            continue;
          }

          const isNew = existing === null;
          if (!dryRun) {
            await fs.mkdir(path.dirname(absPath), { recursive: true });
            await fs.writeFile(absPath, file.content);
            fileResults.push({ path: file.relativePath, action: isNew ? 'created' : 'updated' });
          } else {
            fileResults.push({ path: file.relativePath, action: isNew ? 'would create' : 'would update' });
          }
        }

        targetResults.push({ target: target.label, scope, files: fileResults, gitignore: gitignoreModified });
      }

      return json(res, 200, { rootFiles: rootResults, targets: targetResults, dryRun });
    }

    // ── Convert — import Cursor .mdc files into .agents/ ──
    if (pathname === '/api/convert' && req.method === 'POST') {
      const body = await readBody(req);
      const cwd = body.cwd || process.cwd();
      const from = body.from || 'cursor';
      const scope = body.scope || 'workspace';
      const dryRun = body.dryRun || false;

      if (from !== 'cursor') {
        return json(res, 400, { error: `Unknown source: "${from}". Available: cursor` });
      }

      const home = os.homedir();
      const rulesDir = path.join(cwd, '.cursor', 'rules');

      if (!(await pathExists(rulesDir))) {
        return json(res, 200, { created: [], skipped: [], error: 'No .cursor/rules/ directory found' });
      }

      // Find .mdc files
      const glob = (await import('fast-glob')).default;
      const mdcFiles = await glob('**/*.mdc', { cwd: rulesDir });

      const autoGenerated = ['_project-context.mdc', '_project-agents.mdc'];
      const userFiles = mdcFiles.filter(f => !autoGenerated.includes(path.basename(f)));

      const destDir = scope === 'global'
        ? path.join(home, '.agents')
        : path.join(cwd, '.agents');

      const matter = (await import('gray-matter')).default;
      const created: string[] = [];
      const skipped: string[] = [];

      for (const relPath of userFiles) {
        const absPath = path.join(rulesDir, relPath);
        const raw = await fs.readFile(absPath, 'utf-8');
        const { data, content } = matter(raw);

        const skillName = path.basename(relPath, '.mdc');
        const description = data.description ?? '';
        const skillContent = content.trim();

        if (!skillContent) { skipped.push(relPath); continue; }

        const skillMd = [
          '---',
          `name: ${skillName}`,
          `description: ${description}`,
          '---',
          '',
          skillContent,
          '',
        ].join('\n');

        const targetPath = path.join(destDir, 'skills', skillName, 'SKILL.md');
        if (await pathExists(targetPath)) {
          skipped.push(skillName);
          continue;
        }

        if (!dryRun) {
          await fs.mkdir(path.dirname(targetPath), { recursive: true });
          await fs.writeFile(targetPath, skillMd);
        }
        created.push(skillName);
      }

      // Also check .cursorrules legacy
      try {
        const legacyContent = await fs.readFile(path.join(cwd, '.cursorrules'), 'utf-8');
        if (legacyContent.trim()) {
          const agentsMdPath = path.join(destDir, 'AGENTS.md');
          if (!(await pathExists(agentsMdPath))) {
            if (!dryRun) {
              await fs.mkdir(path.dirname(agentsMdPath), { recursive: true });
              await fs.writeFile(agentsMdPath, legacyContent);
            }
            created.push('AGENTS.md (from .cursorrules)');
          }
        }
      } catch {}

      return json(res, 200, { from, scope, created, skipped, dryRun });
    }

    // ── MCP List ──
    if (pathname === '/api/mcp/list' && req.method === 'POST') {
      const body = await readBody(req);
      const cwd = body.cwd || process.cwd();
      const home = os.homedir();

      const globalMcp = await readFileOrNull(path.join(home, '.agents', 'mcp.json'));
      const workspaceMcp = await readFileOrNull(path.join(cwd, '.agents', 'mcp.json'));

      let globalServers: Record<string, McpServer> = {};
      let workspaceServers: Record<string, McpServer> = {};
      try { if (globalMcp) { const p = JSON.parse(globalMcp); globalServers = p.mcpServers ?? p ?? {}; } } catch {}
      try { if (workspaceMcp) { const p = JSON.parse(workspaceMcp); workspaceServers = p.mcpServers ?? p ?? {}; } } catch {}

      return json(res, 200, { global: globalServers, workspace: workspaceServers });
    }

    // ── MCP Add ──
    if (pathname === '/api/mcp/add' && req.method === 'POST') {
      const body = await readBody(req);
      const cwd = body.cwd || process.cwd();
      const scope = body.scope || 'workspace';
      const name = body.name;
      const serverDef = body.server || {};

      if (!name) return json(res, 400, { error: 'name required' });

      const filePath = scope === 'global'
        ? path.join(os.homedir(), '.agents', 'mcp.json')
        : path.join(cwd, '.agents', 'mcp.json');

      let data: { mcpServers: Record<string, McpServer> } = { mcpServers: {} };
      try {
        const raw = await fs.readFile(filePath, 'utf-8');
        data = JSON.parse(raw);
        if (!data.mcpServers) data.mcpServers = {};
      } catch {}

      data.mcpServers[name] = serverDef;
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, JSON.stringify(data, null, 2) + '\n');

      return json(res, 200, { added: name, scope });
    }

    // ── MCP Remove ──
    if (pathname === '/api/mcp/remove' && req.method === 'POST') {
      const body = await readBody(req);
      const cwd = body.cwd || process.cwd();
      const scope = body.scope || 'workspace';
      const name = body.name;

      if (!name) return json(res, 400, { error: 'name required' });

      const filePath = scope === 'global'
        ? path.join(os.homedir(), '.agents', 'mcp.json')
        : path.join(cwd, '.agents', 'mcp.json');

      let data: { mcpServers: Record<string, McpServer> } = { mcpServers: {} };
      try {
        const raw = await fs.readFile(filePath, 'utf-8');
        data = JSON.parse(raw);
        if (!data.mcpServers) data.mcpServers = {};
      } catch {}

      if (!(name in data.mcpServers)) return json(res, 404, { error: `${name} not found` });

      delete data.mcpServers[name];
      await fs.writeFile(filePath, JSON.stringify(data, null, 2) + '\n');

      return json(res, 200, { removed: name, scope });
    }

    // ── IDE Detection ──
    if (pathname === '/api/detect-ides' && req.method === 'POST') {
      const body = await readBody(req);
      const cwd = body.cwd || process.cwd();
      const ides = await detectInstalledTools(os.homedir(), cwd);
      return json(res, 200, { ides });
    }

    // ── Browse directory ──
    if (pathname === '/api/browse' && req.method === 'POST') {
      const body = await readBody(req);
      const dir = body.path || os.homedir();
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        const items = entries
          .filter(e => !e.name.startsWith('.') || e.name === '.agents' || e.name === '.agentrc' || e.name === '.cursor' || e.name === '.github' || e.name === '.windsurf' || e.name === '.gemini' || e.name === '.claude')
          .map(e => ({
            name: e.name,
            isDirectory: e.isDirectory(),
            path: path.join(dir, e.name),
          }));
        return json(res, 200, { path: dir, parent: path.dirname(dir), items });
      } catch (err: any) {
        return json(res, 400, { error: err.message });
      }
    }

    // ── Read file ──
    if (pathname === '/api/read-file' && req.method === 'POST') {
      const body = await readBody(req);
      if (!body.path) return json(res, 400, { error: 'path required' });
      const content = await readFileOrNull(body.path);
      if (content === null) return json(res, 404, { error: 'file not found' });
      return json(res, 200, { content });
    }

    // ── Write file ──
    if (pathname === '/api/write-file' && req.method === 'POST') {
      const body = await readBody(req);
      if (!body.path || body.content === undefined) return json(res, 400, { error: 'path and content required' });
      await fs.mkdir(path.dirname(body.path), { recursive: true });
      await fs.writeFile(body.path, body.content);
      return json(res, 200, { written: body.path });
    }

    // ── Available targets ──
    if (pathname === '/api/targets') {
      return json(res, 200, { targets: targets.map(t => ({ name: t.name, label: t.label })) });
    }

    // ── Fallback ──
    json(res, 404, { error: 'Not found' });

  } catch (err: any) {
    console.error('Server error:', err);
    json(res, 500, { error: err.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Agent CLI server running on http://${HOST}:${PORT}`);
});
