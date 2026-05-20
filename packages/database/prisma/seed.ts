import { PrismaClient, ProductStatus } from '@prisma/client';

const prisma = new PrismaClient();

const SIZES = ['XS', 'S', 'M', 'L', 'XL'];

const PRODUCTS = [
  {
    name: 'Clara Boardshort',
    slug: 'clara-boardshort',
    description: 'Clara Boardshort — Mediterranean style boardshort.',
    priceInCents: 8900,
  },
  {
    name: 'Lluc Boardshort',
    slug: 'lluc-boardshort',
    description: 'Lluc Boardshort — Mediterranean style boardshort.',
    priceInCents: 9500,
  },
  {
    name: 'Mar Boardshort',
    slug: 'mar-boardshort',
    description: 'Mar Boardshort — Mediterranean style boardshort.',
    priceInCents: 8500,
  },
  {
    name: 'Pilar Boardshort',
    slug: 'pilar-boardshort',
    description: 'Pilar Boardshort — Mediterranean style boardshort.',
    priceInCents: 9900,
  },
  {
    name: 'Tomeu Boardshort',
    slug: 'tomeu-boardshort',
    description: 'Tomeu Boardshort — Mediterranean style boardshort.',
    priceInCents: 8700,
  },
];

async function main() {
  console.log('Seeding database...\n');

  for (const productData of PRODUCTS) {
    const existing = await prisma.product.findUnique({
      where: { slug: productData.slug },
    });

    if (existing) {
      console.log(`⏭  ${productData.name} already exists, skipping.`);
      continue;
    }

    const product = await prisma.product.create({
      data: {
        name: productData.name,
        slug: productData.slug,
        description: productData.description,
        status: ProductStatus.ACTIVE,
        variants: {
          create: SIZES.map((size) => ({
            size,
            sku: `${productData.slug}-${size.toLowerCase()}`,
            priceInCents: productData.priceInCents,
            status: ProductStatus.ACTIVE,
            inventory: {
              create: {
                stockQuantity: 20,
                reservedQuantity: 0,
              },
            },
          })),
        },
      },
      include: { variants: true },
    });

    console.log(`✓ ${product.name} (${product.variants.length} variants)`);
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
