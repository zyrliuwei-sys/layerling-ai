import { z } from 'zod';

import { getAuth } from '@/core/auth';
import { enforceMinIntervalRateLimit } from '@/lib/rate-limit';
import { respErr } from '@/lib/resp';
import { m } from '@/paraglide/messages.js';

export class CadHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}

const MAX_JSON_BYTES = 32 * 1024;

export async function readCadJson(request: Request): Promise<unknown> {
  const contentType = request.headers
    .get('content-type')
    ?.split(';')[0]
    .trim()
    .toLowerCase();
  if (contentType !== 'application/json') {
    throw new CadHttpError(415, m['cad.api.json_required']());
  }
  if (Number(request.headers.get('content-length')) > MAX_JSON_BYTES) {
    throw new CadHttpError(413, m['cad.api.body_too_large']());
  }
  const reader = request.body?.getReader();
  if (!reader) throw new CadHttpError(400, m['cad.api.invalid_request']());

  const body = new Uint8Array(MAX_JSON_BYTES);
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (length + value.byteLength > MAX_JSON_BYTES) {
        await reader.cancel();
        throw new CadHttpError(413, m['cad.api.body_too_large']());
      }
      body.set(value, length);
      length += value.byteLength;
    }
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(body.subarray(0, length))
    );
  } catch (error) {
    if (error instanceof CadHttpError) throw error;
    throw new CadHttpError(400, m['cad.api.invalid_request']());
  } finally {
    reader.releaseLock();
  }
}

const noCache = { 'cache-control': 'private, no-store' };

export async function withCadUser(
  request: Request,
  keyPrefix: string,
  handler: (userId: string) => Promise<Response>
): Promise<Response> {
  const intervalMs = request.method === 'GET' ? 250 : 1000;
  const limited = enforceMinIntervalRateLimit(request, {
    intervalMs,
    keyPrefix,
  });
  if (limited) return limited;

  try {
    if (
      request.method !== 'GET' &&
      request.headers.get('origin') !== new URL(request.url).origin
    ) {
      throw new CadHttpError(403, m['cad.api.same_origin']());
    }
    const session = await getAuth().api.getSession({
      headers: request.headers,
    });
    if (!session?.user) throw new CadHttpError(401, m['cad.api.sign_in']());

    const userLimited = enforceMinIntervalRateLimit(request, {
      intervalMs,
      keyPrefix,
      extraKey: session.user.id,
    });
    if (userLimited) return userLimited;

    const response = await handler(session.user.id);
    response.headers.set('cache-control', noCache['cache-control']);
    return response;
  } catch (error) {
    if (error instanceof CadHttpError)
      return respErr(error.message, { status: error.status, headers: noCache });
    if (error instanceof z.ZodError)
      return respErr(m['cad.api.invalid_request'](), {
        status: 400,
        headers: noCache,
      });
    console.error(`[${keyPrefix}] request failed`);
    return respErr(m['cad.api.unavailable'](), {
      status: 503,
      headers: noCache,
    });
  }
}
