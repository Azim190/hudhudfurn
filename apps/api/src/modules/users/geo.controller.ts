import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../core/prisma/prisma.service';
import { Public } from '../auth/interface/decorators';

@ApiTags('geo')
@Public()
@Controller('geo')
export class GeoController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('cities')
  cities() {
    return this.prisma.city.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { nameAr: 'asc' }],
      select: { id: true, code: true, nameAr: true, nameEn: true, regionCode: true, codAllowed: true },
    });
  }

  @Get('cities/:id/districts')
  districts(@Param('id', ParseUUIDPipe) id: string) {
    return this.prisma.district.findMany({
      where: { cityId: id },
      orderBy: { nameAr: 'asc' },
      select: { id: true, nameAr: true, nameEn: true },
    });
  }
}
