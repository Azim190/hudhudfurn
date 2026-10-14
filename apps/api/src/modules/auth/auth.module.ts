import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { RbacModule } from '../rbac/rbac.module';
import { SmsModule } from '../sms/sms.module';
import { OtpService } from './application/otp.service';
import { StaffAuthService } from './application/staff-auth.service';
import { TokenService } from './application/token.service';
import { AuthController } from './interface/auth.controller';
import { JwtAuthGuard, PermissionsGuard } from './interface/guards';

@Module({
  // Secrets are passed per call so access and MFA tokens can never be confused.
  imports: [JwtModule.register({}), SmsModule, RbacModule],
  controllers: [AuthController],
  providers: [
    TokenService,
    OtpService,
    StaffAuthService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [TokenService, StaffAuthService],
})
export class AuthModule {}
