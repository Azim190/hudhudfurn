import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Prisma } from '@prisma/client';
import { translate } from '@hudhud/i18n';
import type { Request, Response } from 'express';
import { localeOf } from '../i18n/request-locale';
import { AppError, type ErrorCode } from './app-error';

export interface ErrorBody {
  statusCode: number;
  code: ErrorCode;
  message: string;
  details?: unknown;
}

const STATUS_CODES: Partial<Record<number, ErrorCode>> = {
  400: 'validation',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'notFound',
  409: 'conflict',
  429: 'rateLimited',
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    const { status, code, details } = this.classify(exception);

    if (status >= 500) {
      this.logger.error({ err: exception, path: req.url }, 'Unhandled exception');
    }

    const locale = localeOf(req);
    const message = translate(locale, `errors.${code}`);
    const body: ErrorBody = {
      statusCode: status,
      code,
      // Fall back to the generic message for codes that have no catalog entry.
      message: message === `errors.${code}` ? translate(locale, 'errors.generic') : message,
      ...(details === undefined ? {} : { details }),
    };
    if (code === 'rateLimited' && details && typeof details === 'object' && 'retryAfterSeconds' in details) {
      res.setHeader('Retry-After', String((details as { retryAfterSeconds: number }).retryAfterSeconds));
    }
    res.status(status).json(body);
  }

  private classify(exception: unknown): { status: number; code: ErrorCode; details?: unknown } {
    if (exception instanceof AppError) {
      return { status: exception.status, code: exception.code, details: exception.details };
    }
    if (exception instanceof ThrottlerException) {
      return { status: HttpStatus.TOO_MANY_REQUESTS, code: 'rateLimited' };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const details =
        status === HttpStatus.BAD_REQUEST && typeof response === 'object' && response && 'message' in response
          ? { fields: (response as { message: unknown }).message }
          : undefined;
      return { status, code: STATUS_CODES[status] ?? 'generic', details };
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return { status: HttpStatus.CONFLICT, code: 'conflict', details: { fields: exception.meta?.['target'] } };
      }
      if (exception.code === 'P2025') return { status: HttpStatus.NOT_FOUND, code: 'notFound' };
    }
    return { status: HttpStatus.INTERNAL_SERVER_ERROR, code: 'generic' };
  }
}
