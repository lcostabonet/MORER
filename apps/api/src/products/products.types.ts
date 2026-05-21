export interface VariantResponse {
  id: string;
  size: string;
  sku: string;
  priceInCents: number;
  compareAtPriceInCents: number | null;
  availableStock: number;
  isAvailable: boolean;
  status: string;
}

export interface ProductListItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  priceInCents: number | null;
  currency: string;
  status: string;
  variants: VariantResponse[];
}

export interface ProductDetail extends ProductListItem {
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
  items: ProductListItem[];
  pagination: Pagination;
}
