import handler from '@tanstack/react-start/server-entry';

import { envConfigs } from './config';
import { runWithDbScope } from './core/db/request-scope';
import {
  getCookieFromHeader,
  REFERRER_COOKIE,
  sanitizeReferrer,
  sanitizeUtm,
} from './lib/cookie';
import { redirectChineseEdition } from './lib/english-only';
import { canonicalPageRequestPath } from './lib/page-path';
import { respErr } from './lib/resp';
import { paraglideMiddleware } from './paraglide/server.js';

// On Cloudflare Workers, stash the binding env (D1, ASSETS, …) on globalThis
// so synchronous code paths (e.g. the db() singleton with DATABASE_PROVIDER=d1)
// can reach bindings without threading the request context through every call.
// The specifier is kept non-literal so bundlers leave the import to runtime;
// outside workerd the import rejects and we just move on.
const CF_WORKERS_MODULE = 'cloudflare:workers';
let cfEnvPromise: Promise<void> | null = null;

const runtime = globalThis as typeof globalThis & {
  __CF_ENV__?: Record<string, unknown>;
  __DEV_D1_READY__?: Promise<void>;
};

async function connectDevD1() {
  // Wrangler runs in the Node SSR worker and stays out of the deploy bundle.
  const wranglerModule = 'wrangler';
  const { getPlatformProxy, unstable_readConfig } = (await import(
    /* @vite-ignore */ wranglerModule
  )) as typeof import('wrangler');
  const configPath = './wrangler.jsonc';
  const config = unstable_readConfig({ config: configPath });
  if (
    !config.d1_databases.some(
      ({ binding, remote }: { binding: string; remote?: boolean }) =>
        binding === 'DB' && remote
    )
  ) {
    throw new Error(
      'Set remote: true on the DB binding in wrangler.jsonc for local D1 development.'
    );
  }

  const platform = await getPlatformProxy({
    configPath,
    envFiles: [],
    persist: false,
  });
  runtime.__CF_ENV__ = platform.env;
  process.once('SIGTERM', () => {
    void platform.dispose().finally(() => process.exit(0));
  });
}

function ensureCloudflareEnv(): Promise<void> {
  if (import.meta.env.DEV && envConfigs.database_provider === 'd1') {
    // Keep the binding alive across source reloads so cached DB clients can use it.
    return (runtime.__DEV_D1_READY__ ??= connectDevD1().catch((error) => {
      delete runtime.__DEV_D1_READY__;
      throw error;
    }));
  }

  if (!cfEnvPromise) {
    cfEnvPromise = import(/* @vite-ignore */ CF_WORKERS_MODULE)
      .then((mod) => {
        runtime.__CF_ENV__ = mod.env;
        ensureDefaultUserAgent();
      })
      .catch(() => {
        // Not running on Cloudflare Workers — nothing to stash.
      });
  }
  return cfEnvPromise;
}

// Cloudflare Workers' fetch sends no User-Agent, while Node's adds one. Some
// APIs reject UA-less requests (GitHub → 403, WeChat Pay v3 → 400), so on
// Workers give every outbound request a default UA unless it sets its own.
let fetchPatched = false;

function ensureDefaultUserAgent() {
  if (fetchPatched) return;
  fetchPatched = true;
  const nativeFetch = globalThis.fetch;
  const userAgent = `${envConfigs.app_name || 'My App'} (+${envConfigs.app_url})`;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined)
    );
    if (headers.has('user-agent')) return nativeFetch(input, init);
    headers.set('user-agent', userAgent);
    return nativeFetch(input, { ...init, headers });
  }) as typeof fetch;
}

const UTM_COOKIE_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
];
const ATTRIBUTION_COOKIE_ATTRS = 'Max-Age=2592000; Path=/; SameSite=Lax';

// Behind a proxy req.url can carry an internal host, so also treat the public
// app URL as "self" when filtering referrers.
function appHost(): string {
  try {
    return new URL(envConfigs.app_url).host;
  } catch {
    return '';
  }
}

// Redirects and fetched responses may have immutable headers. Copy those
// before applying first-party attribution cookies below.
function withMutableHeaders(response: Response): Response {
  try {
    response.headers.delete('X-Powered-By');
    return response;
  } catch {
    const copy = new Response(response.body, response);
    copy.headers.delete('X-Powered-By');
    return copy;
  }
}

function inRoute(path: string, prefix: string) {
  return path === prefix || path.startsWith(`${prefix}/`);
}

const accountPages = new Set([
  '/auth-callback',
  '/forgot-password',
  '/projects',
  '/redeem-invite',
  '/reset-password',
  '/sign-in',
  '/sign-up',
  '/verify-email',
]);

function addResponsePolicies(response: Response, url: URL) {
  const headers = response.headers;
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const privatePage =
    accountPages.has(path) ||
    inRoute(path, '/settings') ||
    inRoute(path, '/admin');
  const privatePreview =
    (inRoute(path, '/blog') && url.searchParams.has('preview')) ||
    (path === '/studio' &&
      (url.searchParams.has('project') || url.searchParams.has('prompt')));

  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (url.protocol === 'https:') {
    headers.set('Strict-Transport-Security', 'max-age=31536000');
  }
  if (privatePage || privatePreview || response.status >= 400) {
    headers.set('X-Robots-Tag', 'noindex');
  }
  if (
    privatePage ||
    privatePreview ||
    ['/api/admin', '/api/auth', '/api/cad', '/api/user'].some((prefix) =>
      inRoute(path, prefix)
    )
  ) {
    headers.set('Cache-Control', 'private, no-store');
  }
  if (
    path === '/auth-callback' ||
    path === '/reset-password' ||
    path === '/verify-email'
  ) {
    headers.set('Referrer-Policy', 'no-referrer');
  }
  if (privatePage && import.meta.env.PROD) {
    headers.set('X-Frame-Options', 'DENY');
    headers.set('Content-Security-Policy', "frame-ancestors 'none'");
  }
  return response;
}

function hasForeignBrowserWrite(request: Request, { pathname, origin }: URL) {
  if (
    !pathname.startsWith('/api/') ||
    ['GET', 'HEAD', 'OPTIONS'].includes(request.method) ||
    !request.headers.has('cookie') ||
    inRoute(pathname, '/api/auth') ||
    inRoute(pathname, '/api/payment/notify')
  )
    return false;

  const source = request.headers.get('origin');
  const fetchSite = request.headers.get('Sec-Fetch-Site');
  if (fetchSite === 'cross-site' || fetchSite === 'same-site') return true;
  return source !== null && source !== origin && source !== appOrigin();
}

function appOrigin() {
  try {
    return new URL(envConfigs.app_url).origin;
  } catch {
    return '';
  }
}

// Custom server entry — wraps every request in a db scope (one db client per
// request on Workers, see core/db/request-scope.ts) and Paraglide's middleware
// so getLocale() resolves per-request (AsyncLocalStorage) during SSR.
export default {
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const redirect = redirectChineseEdition(req);
    if (redirect) return addResponsePolicies(withMutableHeaders(redirect), url);
    const pathname = canonicalPageRequestPath(req.method, url.pathname);
    if (pathname !== url.pathname) {
      const target = new URL(url);
      target.pathname = pathname;
      return addResponsePolicies(
        withMutableHeaders(Response.redirect(target, 301)),
        url
      );
    }
    if (hasForeignBrowserWrite(req, url)) {
      return addResponsePolicies(
        respErr('Same-origin request required', { status: 403 }),
        url
      );
    }
    await ensureCloudflareEnv();
    // Wrap the whole request so anything before/after the handler shares
    // the same db client too.
    return runWithDbScope(() => handleRequest(req, url));
  },
};

async function handleRequest(req: Request, url: URL): Promise<Response> {
  const response = withMutableHeaders(
    await paraglideMiddleware(req, () => handler.fetch(req))
  );
  // First-touch attribution: remember UTM params for 30 days so sign-up can
  // stamp them onto the user row. Never overwrite an existing cookie.
  const params = url.searchParams;
  const cookieAttributes = `${ATTRIBUTION_COOKIE_ATTRS}${url.protocol === 'https:' ? '; Secure' : ''}`;
  const cookieHeader = req.headers.get('cookie');
  for (const key of UTM_COOKIE_KEYS) {
    const value = params.get(key);
    if (!value || getCookieFromHeader(cookieHeader, key)) continue;
    const sanitized = sanitizeUtm(value);
    if (sanitized) {
      response.headers.append(
        'Set-Cookie',
        `${key}=${encodeURIComponent(sanitized)}; ${cookieAttributes}`
      );
    }
  }
  // First-touch referrer: only page navigations arriving from another site.
  // Browsers usually trim cross-site referrers to the origin, which is fine.
  const referer = req.headers.get('referer');
  if (
    referer &&
    req.method === 'GET' &&
    (req.headers.get('accept') || '').includes('text/html') &&
    !getCookieFromHeader(cookieHeader, REFERRER_COOKIE)
  ) {
    const sanitized = sanitizeReferrer(referer, [url.host, appHost()]);
    if (sanitized) {
      response.headers.append(
        'Set-Cookie',
        `${REFERRER_COOKIE}=${encodeURIComponent(sanitized)}; ${cookieAttributes}`
      );
    }
  }
  return addResponsePolicies(response, url);
}
