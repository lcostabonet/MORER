export interface ProductVariant {
  id: string;
  size: string;
  sku: string;
  priceInCents: number;
  compareAtPriceInCents: number | null;
  availableStock: number;
  isAvailable: boolean;
  status: string;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  priceInCents: number | null;
  currency: string;
  status: string;
  variants: ProductVariant[];
}

export interface ProductDetail extends Product {
  seoTitle: string | null;
  seoDescription: string | null;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedProducts {
  items: Product[];
  pagination: Pagination;
}
