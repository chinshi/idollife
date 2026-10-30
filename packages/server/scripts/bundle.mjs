import { build } from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const project = join(here, '..');

// 把 server 入口（含 workspace 包 @idollife/core 的 TS 源码）
// 打成一个自包含的 ESM 文件，避免 Vercel 不转译 node_modules 里的 TS。
await build({
  entryPoints: [join(project, 'src', 'vercel.ts')],
  outfile: join(project, 'api', '[...path].js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  logLevel: 'info',
});
