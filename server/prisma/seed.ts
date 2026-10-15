// Development sample data only. Run: npm run db:seed
import { prisma } from "../src/db";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Seed is for development only");
  const dresses = await prisma.category.upsert({ where: { slug: "dresses" }, update: {}, create: { name: "Dresses", slug: "dresses" } });
  const tops = await prisma.category.upsert({ where: { slug: "tops" }, update: {}, create: { name: "Tops", slug: "tops" } });
  const items = [
    { name: "Floral Summer Dress", slug: "floral-summer-dress", cat: dresses.id, price: 249900, sale: 199900, colour: "Blue" },
    { name: "Classic Black Midi Dress", slug: "classic-black-midi-dress", cat: dresses.id, price: 349900, sale: null, colour: "Black" },
    { name: "Linen Shirt", slug: "linen-shirt", cat: tops.id, price: 149900, sale: null, colour: "White" },
  ];
  for (const i of items) {
    await prisma.product.upsert({
      where: { slug: i.slug }, update: {},
      create: {
        name: i.name, slug: i.slug, description: "Sample product for development.", pricePaise: i.price, salePricePaise: i.sale,
        published: true, categoryId: i.cat,
        variants: { create: ["S", "M", "L"].map((size) => ({ sku: `${i.slug}-${size}`.toUpperCase(), size, colour: i.colour, stock: 10 })) },
      },
    });
  }
  console.log("Seeded 2 categories and 3 products");
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
