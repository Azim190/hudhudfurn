import { HttpStatus } from '@nestjs/common';

/**
 * Error codes map 1:1 to `errors.<code>` keys in the shared message catalogs, so clients get a
 * localized message and a stable machine-readable code.
 */
export type ErrorCode =
  | 'generic'
  | 'notFound'
  | 'unauthorized'
  | 'forbidden'
  | 'validation'
  | 'conflict'
  | 'rateLimited'
  | 'phoneInvalid'
  | 'otpInvalid'
  | 'otpExpired'
  | 'otpTooManyAttempts'
  | 'invalidCredentials'
  | 'totpInvalid'
  | 'totpRequired'
  | 'totpAlreadyEnrolled'
  | 'sessionExpired'
  | 'sessionRotated'
  | 'accountBlocked'
  | 'emailTaken'
  | 'lastOwner'
  | 'outOfStock'
  | 'insufficientStock'
  | 'configurationRequired'
  | 'measurementsRequired'
  | 'productUnavailable'
  | 'sampleUnavailable'
  | 'cartLimit'
  | 'alreadyInStock'
  | 'cartEmpty'
  | 'cartNotReady'
  | 'couponInvalid'
  | 'couponNotApplicable'
  | 'shippingUnavailable'
  | 'pickupUnavailable'
  | 'paymentMethodUnavailable'
  | 'idempotencyMismatch'
  | 'requestInProgress'
  | 'orderNotPayable'
  | 'orderTransitionInvalid'
  | 'refundFailed'
  | 'paymentProviderError';

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: HttpStatus,
    readonly details?: Record<string, unknown>,
  ) {
    super(code);
    this.name = 'AppError';
  }

  static notFound(details?: Record<string, unknown>) {
    return new AppError('notFound', HttpStatus.NOT_FOUND, details);
  }
  static unauthorized(code: ErrorCode = 'unauthorized') {
    return new AppError(code, HttpStatus.UNAUTHORIZED);
  }
  static forbidden(code: ErrorCode = 'forbidden') {
    return new AppError(code, HttpStatus.FORBIDDEN);
  }
  static badRequest(code: ErrorCode, details?: Record<string, unknown>) {
    return new AppError(code, HttpStatus.BAD_REQUEST, details);
  }
  static conflict(code: ErrorCode = 'conflict', details?: Record<string, unknown>) {
    return new AppError(code, HttpStatus.CONFLICT, details);
  }
  static rateLimited(retryAfterSeconds?: number) {
    return new AppError(
      'rateLimited',
      HttpStatus.TOO_MANY_REQUESTS,
      retryAfterSeconds === undefined ? undefined : { retryAfterSeconds },
    );
  }
}
