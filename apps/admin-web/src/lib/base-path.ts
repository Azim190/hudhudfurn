/**
 * The admin app is served under /admin on the main site (the storefront proxies /admin/* here).
 * Next.js prefixes <Link>, router and redirects itself; raw fetch/href/src URLs must use `withBase`.
 */
export const BASE_PATH = '/admin';

export const withBase = (path: string) => `${BASE_PATH}${path}`;
