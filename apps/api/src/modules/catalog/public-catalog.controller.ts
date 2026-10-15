import { BadRequestException, Controller, Get, Header, Param, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Public } from '../auth/interface/decorators';
import { ATTRIBUTE_KEY, PublicProductQueryDto, VALUE_CODE } from './catalog.dto';
import { CatalogPublicService } from './catalog-public.service';

const CACHE = 'public, max-age=60, s-maxage=300, stale-while-revalidate=600';

/**
 * Split `f.<attributeKey>=code1,code2` facet parameters from the regular query parameters.
 * (Express 5 uses a flat query parser, so nested `f[color]` syntax is not available.)
 */
export function splitFacetParams(raw: Record<string, unknown>) {
  const facets: Record<string, string[]> = {};
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!key.startsWith('f.')) {
      rest[key] = value;
      continue;
    }
    const attr = key.slice(2);
    if (!ATTRIBUTE_KEY.test(attr)) throw new BadRequestException({ message: [`invalid facet ${attr}`] });
    const codes = (Array.isArray(value) ? value : [value])
      .flatMap((v) => String(v).split(','))
      .map((c) => c.trim())
      .filter(Boolean);
    if (codes.some((c) => !VALUE_CODE.test(c)) || codes.length > 50) throw new BadRequestException({ message: [`invalid values for ${attr}`] });
    facets[attr] = [...new Set(codes)];
  }
  return { facets, rest };
}

@ApiTags('catalog')
@Public()
@Controller()
export class PublicCatalogController {
  constructor(private readonly catalog: CatalogPublicService) {}

  @Get('categories')
  @Header('Cache-Control', CACHE)
  categories() {
    return this.catalog.categoryTree();
  }

  @Get('categories/:slug')
  @Header('Cache-Control', CACHE)
  category(@Param('slug') slug: string) {
    return this.catalog.categoryBySlug(slug);
  }

  @Get('products')
  @SkipThrottle()
  @Header('Cache-Control', CACHE)
  @ApiQuery({ name: 'f.<attribute>', required: false, description: 'Facet filter, e.g. f.color=black,navy' })
  async products(@Query() raw: Record<string, unknown>) {
    const { facets, rest } = splitFacetParams(raw);
    const dto = plainToInstance(PublicProductQueryDto, rest);
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    if (errors.length) throw new BadRequestException({ message: errors.flatMap((e) => Object.values(e.constraints ?? {})) });
    return this.catalog.listProducts({ ...dto, facets, page: dto.page ?? 1, limit: dto.limit ?? 24 });
  }

  @Get('products/:slug')
  @Header('Cache-Control', CACHE)
  product(@Param('slug') slug: string) {
    return this.catalog.productBySlug(slug);
  }

  @Get('collections/:slug')
  @Header('Cache-Control', CACHE)
  collection(@Param('slug') slug: string) {
    return this.catalog.collectionBySlug(slug);
  }

  @Get('search')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async search(@Query() raw: Record<string, unknown>) {
    return this.products(raw);
  }

  @Get('search/suggest')
  @Throttle({ default: { limit: 240, ttl: 60_000 } })
  suggest(@Query('q') q = '') {
    return this.catalog.suggest(String(q));
  }
}
