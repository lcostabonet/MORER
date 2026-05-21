import type { PaginatedProducts, ProductDetail } from '@/types/product';
import { API_URL } from './config';

export async function getProducts(page = 1, limit = 20): Promise<PaginatedProducts> {
  const res = await fetch(`${API_URL}/products?page=${page}&limit=${limit}`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) throw new Error('Error al cargar productos');
  return res.json() as Promise<PaginatedProducts>;
}

export async function getProductBySlug(slug: string): Promise<ProductDetail | null> {
  const res = await fetch(`${API_URL}/products/${encodeURIComponent(slug)}`, {
    next: { revalidate: 60 },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Error al cargar el producto');
  return res.json() as Promise<ProductDetail>;
}
