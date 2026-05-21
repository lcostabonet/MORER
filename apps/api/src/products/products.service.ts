import { Injectable, NotFoundException } from '@nestjs/common';
import { ProductStatus } from '@morer/database';
import { PrismaService } from '../database/prisma.service';
import { DEFAULT_CURRENCY } from './products.constants';
import {
  PaginatedProducts,
  ProductDetail,
  ProductListItem,
  VariantResponse,
} from './products.types';

const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL'];

type RawVariant = {
  id: string;
  size: string;
  sku: string;
  priceInCents: number;
  compareAtPriceInCents: number | null;
  status: string;
  inventory: { stockQuantity: number; reservedQuantity: number } | null;
};

type RawProduct = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  status: string;
  variants: RawVariant[];
};

const VARIANTS_INCLUDE = {
  where: { status: ProductStatus.ACTIVE, deletedAt: null },
  include: { inventory: true },
};

// Only products with at least one active non-deleted variant.
const ACTIVE_PRODUCT_WHERE = {
  status: ProductStatus.ACTIVE,
  variants: { some: { status: ProductStatus.ACTIVE, deletedAt: null } },
};

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(page: number, limit: number): Promise<PaginatedProducts> {
    const total = await this.prisma.product.count({ where: ACTIVE_PRODUCT_WHERE });

    const products = (await this.prisma.product.findMany({
      where: ACTIVE_PRODUCT_WHERE,
      include: { variants: VARIANTS_INCLUDE },
      orderBy: { createdAt: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    })) as RawProduct[];

    return {
      items: products.map((p) => this.mapProductList(p)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findBySlug(slug: string): Promise<ProductDetail> {
    const product = (await this.prisma.product.findUnique({
      where: { slug },
      include: { variants: VARIANTS_INCLUDE },
    })) as RawProduct | null;

    if (!product || product.status !== ProductStatus.ACTIVE) {
      throw new NotFoundException('Product not found');
    }

    if (product.variants.length === 0) {
      throw new NotFoundException('Product is not available');
    }

    return this.mapProductDetail(product);
  }

  private sortVariants(variants: RawVariant[]): RawVariant[] {
    return [...variants].sort((a, b) => {
      const ai = SIZE_ORDER.indexOf(a.size);
      const bi = SIZE_ORDER.indexOf(b.size);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  }

  private mapVariant(variant: RawVariant): VariantResponse {
    const stock = variant.inventory?.stockQuantity ?? 0;
    const reserved = variant.inventory?.reservedQuantity ?? 0;
    const availableStock = Math.max(0, stock - reserved);

    return {
      id: variant.id,
      size: variant.size,
      sku: variant.sku,
      priceInCents: variant.priceInCents,
      compareAtPriceInCents: variant.compareAtPriceInCents,
      availableStock,
      isAvailable: availableStock > 0 && variant.status === ProductStatus.ACTIVE,
      status: variant.status,
    };
  }

  private getBasePrice(variants: RawVariant[]): number | null {
    if (variants.length === 0) return null;
    return Math.min(...variants.map((v) => v.priceInCents));
  }

  private mapProductList(product: RawProduct): ProductListItem {
    const sorted = this.sortVariants(product.variants);
    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      description: product.description,
      priceInCents: this.getBasePrice(sorted),
      currency: DEFAULT_CURRENCY,
      status: product.status,
      variants: sorted.map((v) => this.mapVariant(v)),
    };
  }

  private mapProductDetail(product: RawProduct): ProductDetail {
    return {
      ...this.mapProductList(product),
      seoTitle: product.seoTitle,
      seoDescription: product.seoDescription,
    };
  }
}
