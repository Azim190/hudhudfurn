import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Locale } from '@hudhud/i18n';
import { RequestLocale } from '../../../core/i18n/request-locale';
import { OtpService } from '../application/otp.service';
import { StaffAuthService } from '../application/staff-auth.service';
import { TokenService } from '../application/token.service';
import type { AuthUser, ClientContext } from '../auth.types';
import { MfaTokenDto, OtpRequestDto, OtpVerifyDto, RefreshDto, StaffLoginDto, TotpVerifyDto } from './auth.dto';
import { Client, CurrentUser, Public } from './decorators';

/**
 * Tokens are returned in the response body. Browsers never call these endpoints directly:
 * the Next.js apps proxy them server-side and keep tokens in httpOnly cookies (ADR-0002).
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly otp: OtpService,
    private readonly staff: StaffAuthService,
    private readonly tokens: TokenService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  @Post('otp/request')
  @HttpCode(200)
  @ApiOperation({ summary: 'Send a login code by SMS to a Saudi mobile number' })
  requestOtp(@Body() dto: OtpRequestDto, @RequestLocale() locale: Locale, @Client() client: ClientContext) {
    return this.otp.request(dto.phone, locale, client);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 600_000 } })
  @Post('otp/verify')
  @HttpCode(200)
  @ApiOperation({ summary: 'Verify the SMS code and sign in (creates the customer on first login)' })
  verifyOtp(@Body() dto: OtpVerifyDto, @RequestLocale() locale: Locale, @Client() client: ClientContext) {
    return this.otp.verify(dto.phone, dto.code, locale, client);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 300_000 } })
  @Post('staff/login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Staff step 1: email + password → MFA token (or session tokens when STAFF_MFA_REQUIRED=false)' })
  staffLogin(@Body() dto: StaffLoginDto, @Client() client: ClientContext) {
    return this.staff.login(dto.email, dto.password, client);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 300_000 } })
  @Post('staff/totp/enroll')
  @HttpCode(200)
  @ApiOperation({ summary: 'Staff first login: create a TOTP secret and return the QR code' })
  enroll(@Body() dto: MfaTokenDto) {
    return this.staff.enroll(dto.mfaToken);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 300_000 } })
  @Post('staff/totp/verify')
  @HttpCode(200)
  @ApiOperation({ summary: 'Staff step 2: TOTP or recovery code → session tokens' })
  verifyTotp(@Body() dto: TotpVerifyDto, @Client() client: ClientContext) {
    return this.staff.verify(dto.mfaToken, { code: dto.code, recoveryCode: dto.recoveryCode }, client);
  }

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rotate the refresh token (reuse revokes the whole session family)' })
  refresh(@Body() dto: RefreshDto, @Client() client: ClientContext) {
    return this.tokens.rotate(dto.refreshToken, client);
  }

  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(204)
  async logout(@CurrentUser() user: AuthUser) {
    await this.tokens.revokeSession(user.id, user.sessionId);
  }

  @ApiBearerAuth()
  @Get('sessions')
  async sessions(@CurrentUser() user: AuthUser) {
    const sessions = await this.tokens.listActive(user.id);
    return sessions.map(({ familyId, ...s }) => ({ ...s, current: familyId === user.familyId }));
  }

  @ApiBearerAuth()
  @Delete('sessions/:id')
  @HttpCode(204)
  async revoke(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.tokens.revokeSession(user.id, id);
  }
}
