import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthUser, ClientContext } from '../auth/auth.types';
import { Client, CurrentUser } from '../auth/interface/decorators';
import { AddressDto, DataRequestDto, UpdateAddressDto, UpdateConsentsDto, UpdateMeDto } from './users.dto';
import { UsersService } from './users.service';

@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
export class MeController {
  constructor(private readonly users: UsersService) {}

  @Get()
  me(@CurrentUser() user: AuthUser) {
    return this.users.profile(user.id);
  }

  @Patch()
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateMeDto) {
    return this.users.updateProfile(user.id, dto);
  }

  @Get('addresses')
  addresses(@CurrentUser() user: AuthUser) {
    return this.users.listAddresses(user.id);
  }

  @Post('addresses')
  createAddress(@CurrentUser() user: AuthUser, @Body() dto: AddressDto) {
    return this.users.createAddress(user.id, dto);
  }

  @Patch('addresses/:id')
  updateAddress(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAddressDto) {
    return this.users.updateAddress(user.id, id, dto);
  }

  @Delete('addresses/:id')
  @HttpCode(204)
  deleteAddress(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.users.deleteAddress(user.id, id);
  }

  @Get('consents')
  consents(@CurrentUser() user: AuthUser) {
    return this.users.consents(user.id);
  }

  @Put('consents')
  updateConsents(@CurrentUser() user: AuthUser, @Body() dto: UpdateConsentsDto, @Client() client: ClientContext) {
    return this.users.updateConsents(user.id, dto, client.ip);
  }

  @Get('data-requests')
  dataRequests(@CurrentUser() user: AuthUser) {
    return this.users.listDataRequests(user.id);
  }

  @Post('data-requests')
  createDataRequest(@CurrentUser() user: AuthUser, @Body() dto: DataRequestDto) {
    return this.users.createDataRequest(user.id, dto);
  }
}
