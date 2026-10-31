import type { IncomingMessage, ServerResponse } from 'node:http';
import { app } from './app';

export const config = { runtime: 'nodejs' };

/**
 * 读请求体：不依赖流的 async iterator（Vercel 的 mock req 有时不发 end 事件）。
 * 300ms 兜底，保证 GET / 无请求体时立刻继续。
 */
function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks));
    };

    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', finish);
    req.on('error', finish);
    req.on('close', finish);
    setTimeout(finish, 300);
  });
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const fail = (status: number, payload: unknown) => {
    if (res.headersSent) return;
    res.statusCode = status;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(payload));
  };

  try {
    const url = `https://${req.headers.host ?? 'localhost'}${req.url ?? '/'}`;

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
      else if (value !== undefined) headers.set(key, value);
    }

    const method = req.method ?? 'GET';
    const body = await readBody(req);
    const hasBody = body.length > 0 && method !== 'GET' && method !== 'HEAD';

    const request = new Request(url, { method, headers, body: hasBody ? body : undefined });

    // 整体 9 秒超时：宁可返回 504，也不要让请求挂到平台上限
    const response = await Promise.race([
      app.fetch(request),
      new Promise<Response>((_, reject) =>
        setTimeout(() => reject(new Error('app.fetch timed out after 9s')), 9000),
      ),
    ]);

    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (err) {
    fail(500, {
      error: 'function crashed',
      detail: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    });
  }
}
