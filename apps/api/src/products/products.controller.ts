import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';
import {
  DEFAULT_LIMIT,
  DEFAULT_PAGE,
  MAX_LIMIT,
  MAX_PAGE,
  SLUG_REGEX,
} from './products.constants';
import { ProductsService } from './products.service';

function parsePage(value: string | undefined): number {
  const parsed = parseInt(value ?? '', 10);
  if (isNaN(parsed) || parsed < 1) return DEFAULT_PAGE;
  return Math.min(parsed, MAX_PAGE);
}

function parseLimit(value: string | undefined): number {
  const parsed = parseInt(value ?? '', 10);
  if (isNaN(parsed) || parsed < 1) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  findAll(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.productsService.findAll(parsePage(page), parseLimit(limit));
  }

  @Get(':slug')
  findBySlug(@Param('slug') slug: string) {
    if (!SLUG_REGEX.test(slug)) {
      throw new BadRequestException('Invalid product slug format');
    }
    return this.productsService.findBySlug(slug);
  }
}
