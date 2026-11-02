#!/usr/bin/env node
// 协作状态扫描：给策划开工前用，一眼看清「dsh 动了什么、任务到哪一步」。
// 用法：node scripts/collab-status.mjs
// 只读，不修改任何文件。

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const collabDir = join(root, 'collab');

function sh(cmd) {
  try {
    return execSync(cmd, { cwd: root, encoding: 'utf8' }).trim();
  } catch (e) {
    return `(执行失败: ${String(e.message).split('\n')[0]})`;
  }
}

const STATUS_RE = /^- 状态：`(.+?)`/m;
const CLAIM_RE = /^- 认领时间：(.+)$/m;
const PRIO_RE = /^- 优先级：(.+)$/m;

console.log('=== 任务板 ===');
if (!existsSync(collabDir)) {
  console.log('（无 collab 目录）');
} else {
  const files = readdirSync(collabDir)
    .filter((f) => f.startsWith('T-') && f.endsWith('.md'))
    .filter((f) => readFileSync(join(collabDir, f), 'utf8').includes('## 回执区'))
    .sort();
  if (files.length === 0) console.log('（无任务文件）');
  for (const f of files) {
    const text = readFileSync(join(collabDir, f), 'utf8');
    const title = (text.match(/^# (.+)$/m) || [, f])[1];
    const status = (text.match(STATUS_RE) || [, '未知'])[1];
    const claim = (text.match(CLAIM_RE) || [, '—'])[1];
    const prio = (text.match(PRIO_RE) || [, '—'])[1];
    const receipt = /## 回执区[\s\S]*?-\s*实现说明：\s*\S/.test(text) ? '回执已填' : '回执未填';
    console.log(`\n${f}`);
    console.log(`  标题    : ${title}`);
    console.log(`  状态    : ${status}`);
    console.log(`  优先级  : ${prio}`);
    console.log(`  认领    : ${claim}`);
    console.log(`  ${receipt}`);
  }
}

console.log('\n=== 变更日志（最近 8 条） ===');
const changesPath = join(collabDir, 'CHANGES.md');
if (existsSync(changesPath)) {
  const lines = readFileSync(changesPath, 'utf8')
    .split('\n')
    .filter((l) => /^- `\d{4}-\d{2}-\d{2}/.test(l))
    .slice(0, 8);
  console.log(lines.length ? lines.join('\n') : '（暂无记录）');
} else {
  console.log('（无 CHANGES.md）');
}

console.log('\n=== 工作区改动（git） ===');
console.log(sh('git status --short') || '（干净，无改动）');

console.log('\n=== 最近提交 ===');
console.log(sh('git log --oneline -5'));

console.log('\n=== 自检提示 ===');
console.log('pnpm test · pnpm check:data · 三包 tsc --noEmit');
