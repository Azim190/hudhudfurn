/** Cookie names only; safe to import from client components. */
export interface SessionCookieNames {
  access: string;
  refresh: string;
  /**
   * Non-sensitive, JS-readable "signed in" flag. It lets cacheable (ISR) pages show the right
   * header state on the client without a request. It grants nothing on its own.
   */
  hint: string;
}

export const STOREFRONT_COOKIES: SessionCookieNames = { access: 'hd_at', refresh: 'hd_rt', hint: 'hd_auth' };
export const ADMIN_COOKIES: SessionCookieNames = { access: 'hda_at', refresh: 'hda_rt', hint: 'hda_auth' };
