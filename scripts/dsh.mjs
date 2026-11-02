#!/usr/bin/env node
/**
 * scripts/dsh.mjs — 策划 → dsh 的 MCP 桥接器（取代 headless 命令行方式）
 *
 * 核心原则：**一条常驻会话**。所有派单都续在同一条 dsh 会话里（dsh_continue_session），
 * 让它一次建立项目认知、长期复用，不重复学习。会话 id 存在 collab/.dsh-session。
 *
 * 用法：
 *   node scripts/dsh.mjs run "<任务指令>" [--cwd <绝对路径>] [--no-wait] [--permission workspace-write] [--new]
 *   node scripts/dsh.mjs run --file <path>    # 从文件读 prompt（推荐：避免 shell 吞掉反引号/括号）
 *   node scripts/dsh.mjs session              # 查看当前主会话
 *   node scripts/dsh.mjs session set <id>     # 切换主会话
 *   node scripts/dsh.mjs session clear        # 清空（下次 run 会新建并绑定）
 *   node scripts/dsh.mjs permission           # 查看派单使用的权限预设
 *   node scripts/dsh.mjs permission set danger-full-access   # 设为完全权限（不再反复弹审批）
 *   node scripts/dsh.mjs compact              # 对主会话跑 /compact 压历史
 *   node scripts/dsh.mjs wait <sessionId> [--limit 5]
 *   node scripts/dsh.mjs open [sessionId]     # 省略则打开主会话
 *   node scripts/dsh.mjs read [sessionId] [--max 4000]
 *   node scripts/dsh.mjs sessions [--mine]
 *   node scripts/dsh.mjs status
 *   node scripts/dsh.mjs call <toolName> '<jsonArgs>'
 *
 * 端点与令牌来自 ~/.dsh/mcp/dsh-mcp-endpoint.json（dsh 运行时写入，令牌只在内存中使用，不打印）。
 * Node 18+ 内置 fetch，无需依赖。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLIENT_LABEL = 'workbuddy-design-planner';
const HERE = dirname(fileURLToPath(import.meta.url));
const SESSION_FILE = resolve(HERE, '..', 'collab', '.dsh-session');
/**
 * 权限预设持久化。
 * 注意：每次 dsh_continue_session / dsh_run_prompt 都会带上 permissionPreset，
 * 未显式指定就会覆盖用户在 GUI 里设的值 —— 这就是「设了完全权限一会儿又变回工作区」的原因。
 * 所以这里落盘一个默认值，派单时始终带上它，不再依赖 GUI 状态。
 */
const PERM_FILE = resolve(HERE, '..', 'collab', '.dsh-permission');
const DEFAULT_PERMISSION = 'danger-full-access';

function readPermission() {
  try {
    const s = readFileSync(PERM_FILE, 'utf8').trim();
    return s || DEFAULT_PERMISSION;
  } catch { return DEFAULT_PERMISSION; }
}

function writePermission(p) {
  const dir = dirname(PERM_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(PERM_FILE, `${p}\n`, 'utf8');
}

function loadEndpoint() {
  const p = join(homedir(), '.dsh', 'mcp', 'dsh-mcp-endpoint.json');
  const ep = JSON.parse(readFileSync(p, 'utf8'));
  if (!ep.url || !ep.token) throw new Error(`端点文件缺少 url/token: ${p}`);
  return ep;
}

function readSession() {
  try {
    const s = readFileSync(SESSION_FILE, 'utf8').trim();
    return s || null;
  } catch { return null; }
}

function writeSession(id) {
  const dir = dirname(SESSION_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(SESSION_FILE, `${id}\n`, 'utf8');
}

function parseSse(text) {
  const i = text.indexOf('{"jsonrpc"');
  if (i < 0) return null;
  let depth = 0, start = i, inStr = false, esc = false;
  for (let k = i; k < text.length; k++) {
    const ch = text[k];
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return text.slice(start, k + 1); }
  }
  return null;
}

async function rpc(toolName, args) {
  const ep = loadEndpoint();
  const res = await fetch(ep.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${ep.token}`,
      'x-dsh-mcp-client': CLIENT_LABEL,
    },
    body: JSON.stringify({
      jsonrpc: '2.0', id: Date.now() % 100000,
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    }),
  });
  const raw = await res.text();
  const jsonStr = parseSse(raw);
  if (!jsonStr) throw new Error(`无法解析响应（HTTP ${res.status}）: ${raw.slice(0, 300)}`);
  const d = JSON.parse(jsonStr);
  if (d.error) throw new Error(`MCP 错误: ${JSON.stringify(d.error)}`);
  const out = d.result?.structuredContent;
  if (out) return out;
  const txt = d.result?.content?.find((c) => c.type === 'text')?.text;
  if (txt) { try { return JSON.parse(txt); } catch { return { text: txt }; } }
  return d.result;
}

/** 派单一轮：优先续用主会话，没有则新建并绑定 */
async function dispatch(prompt, opts = {}) {
  const existing = opts.forceNew ? null : readSession();
  const base = {
    prompt,
    permissionPreset: opts.permission ?? readPermission(),
    wait: opts.wait !== false,
    ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}),
  };
  if (existing) {
    const r = await rpc('dsh_continue_session', { sessionId: existing, ...base });
    console.error(`[续用主会话] ${existing}`);
    return { ...r, sessionId: r.sessionId ?? existing, continued: true };
  }
  const r = await rpc('dsh_run_prompt', { ...base, cwd: opts.cwd ?? process.cwd() });
  if (r.sessionId) {
    writeSession(r.sessionId);
    console.error(`[新建主会话并绑定] ${r.sessionId}`);
  }
  return { ...r, continued: false };
}

// ---------- CLI ----------
const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};
const has = (name) => argv.includes(`--${name}`);
const print = (o) => console.log(JSON.stringify(o, null, 2));
/** 带值的 flag（其后的一个 token 属于 flag，不是位置参数） */
const FLAGS_WITH_VALUE = ['cwd', 'permission', 'timeout', 'limit', 'max', 'mode', 'file'];
/** 取第 n 个位置参数（跳过所有 --flag 及其值） */
const arg = (n) => {
  const out = [];
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      if (FLAGS_WITH_VALUE.includes(a.slice(2))) i++;
      continue;
    }
    out.push(a);
  }
  return out[n];
};

try {
  switch (cmd) {
    case 'run': {
      // prompt 可直接给字符串，或用 --file <路径> 从文件读（避免 shell 吞掉反引号/括号）
      const prompt = flag('file') ? readFileSync(flag('file'), 'utf8') : argv[1];
      if (!prompt) throw new Error('缺少任务指令（或 --file <路径>）');
      const r = await dispatch(prompt, {
        cwd: flag('cwd', process.cwd()),
        permission: flag('permission', readPermission()),
        wait: !has('no-wait'),
        timeoutMs: flag('timeout') ? Number(flag('timeout')) : undefined,
        forceNew: has('new'),
      });
      print(r);
      break;
    }
    case 'permission': {
      const sub = argv[1];
      if (!sub || sub === 'get') {
        console.log(`当前派单权限: ${readPermission()}  （${
          readPermission() === 'danger-full-access' ? '完全权限，不再弹审批' : '受限，会反复要求同意'
        }）\n文件: ${PERM_FILE}`);
      } else if (sub === 'set') {
        const v = argv[2];
        if (!['read-only', 'workspace-write', 'danger-full-access'].includes(v)) {
          throw new Error('取值只能是 read-only / workspace-write / danger-full-access');
        }
        writePermission(v);
        console.log(`✓ 派单权限已设为 ${v}（以后每次派单都会带上它，不会再被覆盖）`);
      } else {
        throw new Error('用法: permission [get|set <preset>]');
      }
      break;
    }
    case 'session': {
      const sub = argv[1];
      if (sub === 'set') {
        if (!argv[2]) throw new Error('缺少 sessionId');
        writeSession(argv[2]);
        console.log(`✓ 主会话已切换为 ${argv[2]}`);
      } else if (sub === 'clear') {
        writeSession('');
        console.log('✓ 已清空，下次 run 会新建并绑定');
      } else {
        const cur = readSession();
        console.log(cur ? `当前主会话: ${cur}\n文件: ${SESSION_FILE}` : '尚未绑定主会话（下次 run 会新建一条）');
      }
      break;
    }
    case 'compact': {
      const sid = arg(0) ?? readSession();
      if (!sid) throw new Error('尚未绑定主会话');
      print(await rpc('dsh_run_command', { sessionId: sid, line: '/compact' }));
      break;
    }
    case 'wait': {
      print(await rpc('dsh_wait_session', {
        sessionId: arg(0) ?? readSession(),
        limit: Number(flag('limit', 0)),
        ...(flag('timeout') ? { timeoutMs: Number(flag('timeout')) } : {}),
      }));
      break;
    }
    case 'open': {
      const sid = arg(0) ?? readSession();
      if (!sid) throw new Error('尚未绑定主会话');
      print(await rpc('dsh_open_session', { sessionId: sid }));
      break;
    }
    case 'read': {
      print(await rpc('dsh_read_session', {
        sessionId: arg(0) ?? readSession(),
        mode: flag('mode', 'tail'),
        maxChars: Number(flag('max', 4000)),
      }));
      break;
    }
    case 'sessions': {
      print(await rpc('dsh_list_sessions', { ...(has('mine') ? { mine: true } : {}), limit: Number(flag('limit', 10)) }));
      break;
    }
    case 'status':
      print(await rpc('dsh_status', {}));
      break;
    case 'call':
      print(await rpc(argv[1], argv[2] ? JSON.parse(argv[2]) : {}));
      break;
    default:
      console.log(readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0].replace('/**', ''));
  }
} catch (e) {
  console.error(`✗ ${e.message}`);
  process.exit(1);
}
