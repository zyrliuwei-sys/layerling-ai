export function canonicalPagePath(pathname: string): string {
  return pathname.replace(/\/+$/, '') || '/';
}

export function canonicalPageRequestPath(
  method: string,
  pathname: string
): string {
  if (
    (method !== 'GET' && method !== 'HEAD') ||
    /^\/api(?:\/|$)/.test(pathname)
  ) {
    return pathname;
  }
  return canonicalPagePath(pathname);
}
