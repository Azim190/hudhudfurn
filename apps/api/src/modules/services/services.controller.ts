import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiHeader, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import type { Locale } from '@hudhud/i18n';
import { AppError } from '../../core/errors/app-error';
import { RequestLocale } from '../../core/i18n/request-locale';
import { IdempotencyService } from '../../core/http/idempotency.service';
import { Audit } from '../audit/audit.interceptor';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser, Public, RequirePermissions } from '../auth/interface/decorators';
import { ConfiguratorService } from '../configurator/configurator.service';
import type { UploadedImage } from '../media/media.service';
import { QuotationsService } from './quotations.service';
import {
  AcceptQuotationDto,
  AdminBookingQueryDto,
  AssignDto,
  AvailabilityQueryDto,
  BookingDto,
  CancelBookingDto,
  GenerateSlotsDto,
  JobsQueryDto,
  MeasurementDto,
  QuotationDto,
  RescheduleDto,
  ServiceAreaDto,
  SignatureDto,
  SlotQueryDto,
  TechnicianDto,
  TechnicianStatusDto,
  UpdateMeasurementDto,
  UpdateServiceAreaDto,
  UpdateSlotDto,
} from './services.dto';
import { ServicesService } from './services.service';
import { TechnicianService } from './technician.service';

const customer = (user: AuthUser | undefined) => {
  if (!user || user.kind !== 'CUSTOMER') throw AppError.unauthorized();
  return user.id;
};

@ApiTags('services')
@Controller('services')
export class ServicesController {
  constructor(
    private readonly services: ServicesService,
    private readonly idempotency: IdempotencyService,
  ) {}

  /** Visit slots for an address (public: customers see availability before signing in). */
  @Public()
  @Get('availability')
  availability(@Query() q: AvailabilityQueryDto, @CurrentUser() user?: AuthUser) {
    return this.services.availability(q, user?.kind === 'CUSTOMER' ? user.id : undefined);
  }

  @ApiBearerAuth()
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @Post('bookings')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  book(@CurrentUser() user: AuthUser, @Body() dto: BookingDto, @Headers('idempotency-key') key?: string) {
    const userId = customer(user);
    if (!key) throw AppError.badRequest('validation', { field: 'Idempotency-Key' });
    return this.idempotency.run(`booking:${userId}`, key, dto, () => this.services.book(userId, dto));
  }

  @ApiBearerAuth()
  @Get('bookings')
  mine(@CurrentUser() user: AuthUser) {
    return this.services.listMine(customer(user));
  }

  @ApiBearerAuth()
  @Get('bookings/:id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.services.getMine(customer(user), id);
  }

  @ApiBearerAuth()
  @Post('bookings/:id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelBookingDto) {
    return this.services.cancelByCustomer(customer(user), id, dto.reason);
  }

  @ApiBearerAuth()
  @Post('bookings/:id/reschedule')
  @HttpCode(200)
  reschedule(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RescheduleDto) {
    return this.services.reschedule(customer(user), id, dto.slotId);
  }
}

@ApiTags('quotations')
@ApiBearerAuth()
@Controller('quotations')
export class QuotationsController {
  constructor(private readonly quotations: QuotationsService) {}

  @Get()
  mine(@CurrentUser() user: AuthUser) {
    return this.quotations.listMine(customer(user));
  }

  @Get(':number')
  get(@CurrentUser() user: AuthUser, @Param('number') number: string) {
    if (!/^QT-\d{4}-\d{6}$/.test(number)) throw AppError.notFound();
    return this.quotations.get(number, customer(user));
  }

  /** Approve and pay: returns the hosted payment page. */
  @Post(':number/accept')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  accept(@CurrentUser() user: AuthUser, @Param('number') number: string, @Body() dto: AcceptQuotationDto, @RequestLocale() locale: Locale) {
    if (!/^QT-\d{4}-\d{6}$/.test(number)) throw AppError.notFound();
    return this.quotations.accept(number, customer(user), dto.paymentMethod, locale);
  }
}

@ApiTags('technician')
@ApiBearerAuth()
@Controller('technician')
export class TechnicianController {
  constructor(
    private readonly tech: TechnicianService,
    private readonly quotations: QuotationsService,
    private readonly configurator: ConfiguratorService,
  ) {}

  @Get('jobs')
  @RequirePermissions('services.technician')
  jobs(@CurrentUser() user: AuthUser, @Query() q: JobsQueryDto) {
    return this.tech.jobs(user.id, q.date);
  }

  @Get('catalog')
  @RequirePermissions('services.technician')
  catalog() {
    return this.tech.catalog();
  }

  @Get('jobs/:id')
  @RequirePermissions('services.technician')
  job(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.tech.get(user.id, id);
  }

  @Post('jobs/:id/status')
  @HttpCode(200)
  @RequirePermissions('services.technician')
  status(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TechnicianStatusDto) {
    return this.tech.setStatus(user.id, id, dto);
  }

  @Post('uploads')
  @ApiConsumes('multipart/form-data')
  @RequirePermissions('services.technician')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 12 * 1024 * 1024, files: 1 } }))
  upload(@CurrentUser() user: AuthUser, @UploadedFile() file: UploadedImage | undefined) {
    return this.configurator.upload(file, user.id);
  }

  @Post('jobs/:id/measurements')
  @RequirePermissions('services.technician')
  addMeasurement(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MeasurementDto) {
    return this.tech.addMeasurement(user.id, id, dto);
  }

  @Patch('jobs/:id/measurements/:measurementId')
  @RequirePermissions('services.technician')
  updateMeasurement(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('measurementId', ParseUUIDPipe) mid: string, @Body() dto: UpdateMeasurementDto) {
    return this.tech.updateMeasurement(user.id, id, mid, dto);
  }

  @Post('jobs/:id/measurements/:measurementId/delete')
  @HttpCode(200)
  @RequirePermissions('services.technician')
  deleteMeasurement(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('measurementId', ParseUUIDPipe) mid: string) {
    return this.tech.deleteMeasurement(user.id, id, mid);
  }

  @Post('jobs/:id/signature')
  @HttpCode(200)
  @RequirePermissions('services.technician')
  sign(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SignatureDto) {
    return this.tech.sign(user.id, id, dto.dataUrl);
  }

  @Post('jobs/:id/quotation')
  @RequirePermissions('services.technician')
  quotation(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: QuotationDto) {
    return this.quotations.create(id, dto, user.id, user.id);
  }
}

@ApiTags('admin: services')
@ApiBearerAuth()
@Controller('admin/services')
export class AdminServicesController {
  constructor(
    private readonly services: ServicesService,
    private readonly quotations: QuotationsService,
    private readonly configurator: ConfiguratorService,
  ) {}

  @Get('areas')
  @RequirePermissions('services.read')
  areas() {
    return this.services.listAreas();
  }

  @Post('areas')
  @RequirePermissions('services.manage')
  @Audit('services.area.create', { entityType: 'serviceArea' })
  createArea(@Body() dto: ServiceAreaDto) {
    return this.services.createArea(dto);
  }

  @Patch('areas/:id')
  @RequirePermissions('services.manage')
  @Audit('services.area.update', { entityType: 'serviceArea', idParam: 'id' })
  updateArea(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateServiceAreaDto) {
    return this.services.updateArea(id, dto);
  }

  @Post('areas/:id/slots/generate')
  @RequirePermissions('services.manage')
  @Audit('services.slots.generate', { entityType: 'serviceArea', idParam: 'id' })
  generate(@Param('id', ParseUUIDPipe) id: string, @Body() dto: GenerateSlotsDto) {
    return this.services.generateSlots(id, dto);
  }

  @Get('areas/:id/slots')
  @RequirePermissions('services.read')
  slots(@Param('id', ParseUUIDPipe) id: string, @Query() q: SlotQueryDto) {
    return this.services.listSlots(id, q.from, q.to);
  }

  @Patch('slots/:id')
  @RequirePermissions('services.manage')
  @Audit('services.slot.update', { entityType: 'timeSlot', idParam: 'id' })
  updateSlot(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSlotDto) {
    return this.services.updateSlot(id, dto);
  }

  @Get('bookings')
  @RequirePermissions('services.read')
  bookings(@Query() q: AdminBookingQueryDto) {
    return this.services.adminList(q);
  }

  @Get('bookings/:id')
  @RequirePermissions('services.read')
  booking(@Param('id', ParseUUIDPipe) id: string) {
    return this.services.adminGet(id);
  }

  @Post('bookings/:id/assign')
  @HttpCode(200)
  @RequirePermissions('services.assign')
  @Audit('services.booking.assign', { entityType: 'booking', idParam: 'id' })
  assign(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignDto) {
    return this.services.assign(id, dto.technicianId, user.id);
  }

  @Post('bookings/:id/cancel')
  @HttpCode(200)
  @RequirePermissions('services.assign')
  @Audit('services.booking.cancel', { entityType: 'booking', idParam: 'id' })
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelBookingDto) {
    return this.services.adminCancel(id, dto.reason?.trim() || 'Cancelled by staff', user.id);
  }

  @Post('bookings/:id/quotation')
  @RequirePermissions('services.manage')
  @Audit('services.quotation.create', { entityType: 'booking', idParam: 'id' })
  quotation(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: QuotationDto) {
    return this.quotations.create(id, dto, user.id);
  }

  @Get('quotations/:number')
  @RequirePermissions('services.read')
  getQuotation(@Param('number') number: string) {
    return this.quotations.get(number);
  }

  @Get('technicians')
  @RequirePermissions('services.read')
  technicians() {
    return this.services.listTechnicians();
  }

  @Put('technicians/:userId')
  @RequirePermissions('services.manage')
  @Audit('services.technician.update', { entityType: 'user', idParam: 'userId' })
  upsertTechnician(@Param('userId', ParseUUIDPipe) userId: string, @Body() dto: TechnicianDto) {
    return this.services.upsertTechnician(userId, dto);
  }

  /** Measurement photos and signatures (private). */
  @Get('uploads/:id')
  @RequirePermissions('services.read')
  async upload(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const { body, contentType } = await this.configurator.uploadContent(id);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(body);
  }
}
