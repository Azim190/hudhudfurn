import { Controller, Get, Header, Param, ParseUUIDPipe, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { InvoiceKind, ZatcaStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { PageQueryDto } from '../../core/http/page-query.dto';
import { RequirePermissions } from '../auth/interface/decorators';
import { InvoicingService } from './invoicing.service';

class InvoiceListQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: InvoiceKind }) @IsOptional() @IsEnum(InvoiceKind) kind?: InvoiceKind;
  @ApiPropertyOptional({ enum: ZatcaStatus }) @IsOptional() @IsEnum(ZatcaStatus) zatcaStatus?: ZatcaStatus;
}

@ApiTags('admin: invoicing')
@ApiBearerAuth()
@Controller('admin/invoices')
export class AdminInvoicesController {
  constructor(private readonly invoicing: InvoicingService) {}

  @Get()
  @RequirePermissions('invoicing.read')
  list(@Query() q: InvoiceListQueryDto) {
    return this.invoicing.list(q);
  }

  /** Integrity check of the whole hash chain (counters, links, hashes, signatures). */
  @Get('chain/verify')
  @RequirePermissions('invoicing.read')
  verifyChain() {
    return this.invoicing.verifyChain();
  }

  @Get(':id')
  @RequirePermissions('invoicing.read')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return this.invoicing.present(await this.invoicing.get(id));
  }

  /** The signed UBL document as submitted to ZATCA. */
  @Get(':id/xml')
  @RequirePermissions('invoicing.read')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  async xml(@Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    const inv = await this.invoicing.get(id);
    res.setHeader('Content-Disposition', `attachment; filename="${inv.number}.xml"`);
    return inv.xml;
  }
}
