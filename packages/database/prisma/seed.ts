import { PrismaClient, ProductStatus } from '@prisma/client';

const prisma = new PrismaClient();

const SIZES = ['XS', 'S', 'M', 'L', 'XL'];

const PRODUCTS = [
  {
    name: 'Clara Boardshort',
    slug: 'clara-boardshort',
    description: 'Clara Boardshort — Mediterranean style boardshort.',
    priceInCents: 5500,
  },
  {
    name: 'Lluc Boardshort',
    slug: 'lluc-boardshort',
    description: 'Lluc Boardshort — Mediterranean style boardshort.',
    priceInCents: 5500,
  },
  {
    name: 'Mar Boardshort',
    slug: 'mar-boardshort',
    description: 'Mar Boardshort — Mediterranean style boardshort.',
    priceInCents: 5500,
  },
  {
    name: 'Pilar Boardshort',
    slug: 'pilar-boardshort',
    description: 'Pilar Boardshort — Mediterranean style boardshort.',
    priceInCents: 5500,
  },
  {
    name: 'Tomeu Boardshort',
    slug: 'tomeu-boardshort',
    description: 'Tomeu Boardshort — Mediterranean style boardshort.',
    priceInCents: 5500,
  },
];

async function main() {
  console.log('Seeding database...\n');

  for (const productData of PRODUCTS) {
    // Upsert product — create or update by slug
    const product = await prisma.product.upsert({
      where: { slug: productData.slug },
      update: {
        name: productData.name,
        description: productData.description,
        status: ProductStatus.ACTIVE,
      },
      create: {
        name: productData.name,
        slug: productData.slug,
        description: productData.description,
        status: ProductStatus.ACTIVE,
      },
    });

    // Upsert each variant and its inventory — create or update by sku
    for (const size of SIZES) {
      const sku = `${productData.slug}-${size.toLowerCase()}`;

      const variant = await prisma.productVariant.upsert({
        where: { sku },
        update: {
          priceInCents: productData.priceInCents,
          compareAtPriceInCents: null,
          status: ProductStatus.ACTIVE,
        },
        create: {
          productId: product.id,
          size,
          sku,
          priceInCents: productData.priceInCents,
          compareAtPriceInCents: null,
          status: ProductStatus.ACTIVE,
        },
      });

      // Upsert inventory — create or update by variantId
      await prisma.inventory.upsert({
        where: { variantId: variant.id },
        update: {
          stockQuantity: 20,
          reservedQuantity: 0,
        },
        create: {
          variantId: variant.id,
          stockQuantity: 20,
          reservedQuantity: 0,
        },
      });
    }

    console.log(`✓ ${productData.name}`);
  }

  console.log('\nSeed completed.');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
