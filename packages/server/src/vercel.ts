import type { IncomingMessage, ServerResponse } from 'node:http';
import { app } from './app';

/**
 * 手写的 Vercel Node 适配器。
 * 不用 `hono/vercel` 的 handle：在 ESM + node20 组合下它会挂起不返回。
 * 这里把 IncomingMessage 转成标准 Request，再交给 Hono 处理。
 */
export const config = { runtime: 'nodejs' };

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const url = `https://${req.headers.host ?? 'localhost'}${req.url ?? '/'}`;

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
      else if (value !== undefined) headers.set(key, value);
    }

    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const hasBody = chunks.length > 0 && req.method !== 'GET' && req.method !== 'HEAD';

    const request = new Request(url, {
      method: req.method ?? 'GET',
      headers,
      body: hasBody ? Buffer.concat(chunks) : undefined,
    });

    const response = await app.fetch(request);

    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify({
        error: 'function crashed',
        detail: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      }),
    );
  }
}
