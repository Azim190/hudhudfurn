import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AppError } from '../../core/errors/app-error';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CatalogPresenter, PRODUCT_FULL_INCLUDE } from '../catalog/catalog.presenter';
import { CategoryService } from '../catalog/category.service';
import { MediaService } from '../media/media.service';
import { StorefrontRevalidator } from './storefront-revalidator';
import type { BannerDto, UpdateBannerDto } from './content.dto';

const BANNER_INCLUDE = { imageAr: true, imageEn: true } satisfies Prisma.BannerInclude;
type BannerRow = Prisma.BannerGetPayload<{ include: typeof BANNER_INCLUDE }>;

@Injectable()
export class ContentService {
  private readonly presenter: CatalogPresenter;

  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly categories: CategoryService,
    private readonly revalidator: StorefrontRevalidator,
  ) {
    this.presenter = new CatalogPresenter(media);
  }

  /** Everything the storefront home page needs in one cacheable response. */
  async home() {
    const now = new Date();
    const live: Prisma.BannerWhereInput = {
      isActive: true,
      AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
    };
    const [banners, tree, collections] = await Promise.all([
      this.prisma.banner.findMany({ where: { ...live, placement: { in: ['HERO', 'STRIP'] } }, include: BANNER_INCLUDE, orderBy: { sortOrder: 'asc' } }),
      this.categories.tree({ activeOnly: true }),
      this.prisma.collection.findMany({
        where: { isActive: true, AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }] },
        orderBy: { sortOrder: 'asc' },
        include: {
          image: true,
          products: {
            orderBy: { sortOrder: 'asc' },
            take: 12,
            where: { product: { status: 'ACTIVE', deletedAt: null } },
            include: { product: { include: PRODUCT_FULL_INCLUDE } },
          },
        },
      }),
    ]);
    return {
      hero: banners.filter((b) => b.placement === 'HERO').map((b) => this.toDto(b)),
      strip: banners.filter((b) => b.placement === 'STRIP').map((b) => this.toDto(b)),
      categories: tree.map(({ children, ...c }) => ({ ...c, children: children.map(({ children: _grand, ...child }) => child) })),
      collections: collections
        .filter((c) => c.products.length > 0)
        .map(({ products, image, ...c }) => ({ ...c, image: image ? this.media.toDto(image) : null, products: products.map((cp) => this.presenter.card(cp.product)) })),
    };
  }

  async list() {
    const rows = await this.prisma.banner.findMany({ include: BANNER_INCLUDE, orderBy: [{ placement: 'asc' }, { sortOrder: 'asc' }] });
    return rows.map((b) => this.toDto(b));
  }

  async create(dto: BannerDto) {
    this.assertWindow(dto.startsAt, dto.endsAt);
    await this.assertMedia(dto.imageArId, dto.imageEnId);
    const banner = await this.prisma.banner.create({ data: dto, include: BANNER_INCLUDE });
    await this.revalidator.tags(['content']);
    return this.toDto(banner);
  }

  async update(id: string, dto: UpdateBannerDto) {
    if (!(await this.prisma.banner.findUnique({ where: { id } }))) throw AppError.notFound();
    this.assertWindow(dto.startsAt, dto.endsAt);
    await this.assertMedia(dto.imageArId, dto.imageEnId);
    const banner = await this.prisma.banner.update({ where: { id }, data: dto, include: BANNER_INCLUDE });
    await this.revalidator.tags(['content']);
    return this.toDto(banner);
  }

  async remove(id: string) {
    await this.prisma.banner.delete({ where: { id } });
    await this.revalidator.tags(['content']);
  }

  toDto(b: BannerRow) {
    const { imageAr, imageEn, ...rest } = b;
    return { ...rest, imageAr: imageAr ? this.media.toDto(imageAr) : null, imageEn: imageEn ? this.media.toDto(imageEn) : null };
  }

  private assertWindow(startsAt?: string | null, endsAt?: string | null) {
    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) throw AppError.badRequest('validation', { reason: 'endsBeforeStarts' });
  }

  private async assertMedia(...ids: Array<string | null | undefined>) {
    const wanted = ids.filter((x): x is string => Boolean(x));
    if (wanted.length && (await this.prisma.mediaAsset.count({ where: { id: { in: wanted } } })) !== new Set(wanted).size) {
      throw AppError.badRequest('validation', { field: 'image' });
    }
  }
}
