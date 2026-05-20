export type ProductStatus = 'active' | 'draft' | 'archived';

export interface Product {
  id: string;
  name: string;
  slug: string;
  status: ProductStatus;
  createdAt: Date;
  updatedAt: Date;
}
