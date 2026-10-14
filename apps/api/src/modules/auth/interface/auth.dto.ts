import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Length, Matches, MaxLength, ValidateIf } from 'class-validator';

export class OtpRequestDto {
  @ApiProperty({ example: '0512345678', description: 'Saudi mobile number in any common format' })
  @IsString()
  @MaxLength(32)
  phone: string;
}

export class OtpVerifyDto extends OtpRequestDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  @Matches(/^[0-9٠-٩]{4,8}$/)
  code: string;
}

export class StaffLoginDto {
  @ApiProperty({ example: 'owner@hudhud.sa' })
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty()
  @IsString()
  @Length(1, 256)
  password: string;
}

export class MfaTokenDto {
  @ApiProperty()
  @IsString()
  @MaxLength(2048)
  mfaToken: string;
}

export class TotpVerifyDto extends MfaTokenDto {
  @ApiProperty({ required: false, example: '123456' })
  @ValidateIf((o: TotpVerifyDto) => !o.recoveryCode)
  @Matches(/^\d{6}$/)
  code?: string;

  @ApiProperty({ required: false, example: 'ABCDE-FGHJK' })
  @IsOptional()
  @Matches(/^[A-Za-z0-9]{5}-?[A-Za-z0-9]{5}$/)
  recoveryCode?: string;
}

export class RefreshDto {
  @ApiProperty()
  @IsString()
  @MaxLength(512)
  refreshToken: string;
}
