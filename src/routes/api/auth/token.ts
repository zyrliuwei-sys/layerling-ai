import { createFileRoute } from '@tanstack/react-router';

import { getAuth, getAuthCookiePrefix } from '@/core/auth';
import { getConfig } from '@/modules/config/service';
import { getCookieFromHeader } from '@/lib/cookie';
import { isAllowedAppProtocolUrl } from '@/lib/redirect';
import { respData, respErr } from '@/lib/resp';
import { serverSiteOrigin } from '@/lib/site-origin';

async function POST({ request }: { request: Request }) {
  const url = new URL(request.url);
  const origin = request.headers.get('origin');
  if (!origin || (origin !== url.origin && origin !== serverSiteOrigin())) {
    return respErr('Same-origin request required', { status: 403 });
  }

  try {
    const target = url.searchParams.get('redirect');
    const allowedSchemes = await getConfig('desktop_auth_schemes');
    if (
      !target ||
      target.length > 2048 ||
      !isAllowedAppProtocolUrl(target, allowedSchemes)
    ) {
      return respErr('Desktop sign-in is unavailable for this destination', {
        status: 403,
      });
    }

    const session = await getAuth().api.getSession({
      headers: request.headers,
    });
    if (!session?.user) return respErr('Unauthorized', { status: 401 });

    const cookies = request.headers.get('cookie');
    const name = `${getAuthCookiePrefix()}.session_token`;
    const token =
      getCookieFromHeader(cookies, `__Secure-${name}`) ??
      getCookieFromHeader(cookies, name);
    if (!token) return respErr('No session token found', { status: 401 });

    return respData({ token: decodeURIComponent(token) });
  } catch {
    return respErr('Desktop sign-in is unavailable', { status: 500 });
  }
}

export const Route = createFileRoute('/api/auth/token')({
  server: {
    handlers: {
      GET: () =>
        respErr('Method not allowed', {
          status: 405,
          headers: { Allow: 'POST' },
        }),
      POST,
    },
  },
});
