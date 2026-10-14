import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { isLocale, negotiateLocale, type Locale } from '@hudhud/i18n';
import type { Request } from 'express';

/** `?lang=` wins, then Accept-Language, then the Arabic default. */
export function localeOf(req: Pick<Request, 'headers' | 'query'>): Locale {
  const q = req.query?.['lang'];
  if (isLocale(q)) return q;
  return negotiateLocale(req.headers['accept-language']);
}

export const RequestLocale = createParamDecorator((_: unknown, ctx: ExecutionContext): Locale =>
  localeOf(ctx.switchToHttp().getRequest<Request>()),
);
