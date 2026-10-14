import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ROLE_KEYS, type RoleKey } from '@hudhud/domain';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateStaffDto {
  @ApiProperty() @IsEmail() @MaxLength(254) email: string;
  @ApiProperty() @IsString() @Length(2, 120) fullName: string;
  @ApiProperty({ description: 'Temporary password (min 12 chars). 2FA enrolment is forced at first login.' })
  @IsString()
  @Length(12, 256)
  temporaryPassword: string;
  @ApiProperty({ enum: ROLE_KEYS, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(ROLE_KEYS.length)
  @IsIn(ROLE_KEYS, { each: true })
  roleKeys: RoleKey[];
}

export class UpdateStaffDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 120) fullName?: string;
  @ApiPropertyOptional({ enum: ['ACTIVE', 'BLOCKED'] }) @IsOptional() @IsIn(['ACTIVE', 'BLOCKED']) status?: 'ACTIVE' | 'BLOCKED';
  @ApiPropertyOptional({ enum: ROLE_KEYS, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(ROLE_KEYS.length)
  @IsIn(ROLE_KEYS, { each: true })
  roleKeys?: RoleKey[];
}

export class AuditQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() actorId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) entityType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) entityId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) action?: string;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional({ default: 50 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit = 50;
}
