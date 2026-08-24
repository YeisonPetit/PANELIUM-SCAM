import { PrismaClient, SeriesStatus, SeriesType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting Database Seeding...');

  // Ensure initial series exist safely without wiping database
  const count = await prisma.series.count();
  if (count > 0) {
    console.log(`ℹ️ Database already contains ${count} series. Skipping seed reset.`);
    return;
  }

  // Create Genres
  const actionGenre = await prisma.genre.create({ data: { name: 'Action', slug: 'action' } });
  const fantasyGenre = await prisma.genre.create({ data: { name: 'Fantasy', slug: 'fantasy' } });
  const systemGenre = await prisma.genre.create({ data: { name: 'System', slug: 'system' } });
  const adventureGenre = await prisma.genre.create({ data: { name: 'Adventure', slug: 'adventure' } });
  const supernaturalGenre = await prisma.genre.create({ data: { name: 'Supernatural', slug: 'supernatural' } });

  // Create Sample User
  await prisma.user.create({
    data: {
      username: 'admin',
      email: 'admin@panelium.com',
      password: 'hashed_password_placeholder',
      role: 'ADMIN',
    },
  });

  // Series 1: Solo Leveling
  const soloLeveling = await prisma.series.create({
    data: {
      title: 'Solo Leveling',
      slug: 'solo-leveling',
      description: 'In a world where hunters, humans who possess magical powers, must battle deadly monsters to protect the human race from certain annihilation, a notoriously weak hunter named Sung Jinwoo finds himself in a seamless struggle for survival.',
      cover: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop&q=80',
      banner: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&auto=format&fit=crop&q=80',
      status: SeriesStatus.COMPLETED,
      type: SeriesType.MANHWA,
      releaseYear: 2018,
      author: 'Chugong',
      artist: 'DUBU (REDICE Studio)',
      genres: {
        create: [
          { genreId: actionGenre.id },
          { genreId: fantasyGenre.id },
          { genreId: systemGenre.id },
        ],
      },
    },
  });

  // Series 2: Omniscient Reader's Viewpoint
  const orv = await prisma.series.create({
    data: {
      title: "Omniscient Reader's Viewpoint",
      slug: 'omniscient-readers-viewpoint',
      description: 'Dokja was an average office worker whose sole interest was reading his favorite web novel "Three Ways to Survive the Apocalypse." But when the novel suddenly becomes reality, he is the only person who knows how the world will end.',
      cover: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=600&auto=format&fit=crop&q=80',
      banner: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1200&auto=format&fit=crop&q=80',
      status: SeriesStatus.ONGOING,
      type: SeriesType.MANHWA,
      releaseYear: 2020,
      author: 'singNsong',
      artist: 'Sleepy-C',
      genres: {
        create: [
          { genreId: actionGenre.id },
          { genreId: fantasyGenre.id },
          { genreId: adventureGenre.id },
        ],
      },
    },
  });

  // Series 3: Tower of God
  const tog = await prisma.series.create({
    data: {
      title: 'Tower of God',
      slug: 'tower-of-god',
      description: 'What do you desire? Money and wealth? Honor and pride? Authority and power? Revenge? Or something that transcends them all? Whatever you desire—it\'s at the top of the Tower.',
      cover: 'https://images.unsplash.com/photo-1563089145-599997674d42?w=600&auto=format&fit=crop&q=80',
      banner: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=1200&auto=format&fit=crop&q=80',
      status: SeriesStatus.ONGOING,
      type: SeriesType.WEBTOON,
      releaseYear: 2010,
      author: 'SIU',
      artist: 'SIU',
      genres: {
        create: [
          { genreId: fantasyGenre.id },
          { genreId: adventureGenre.id },
          { genreId: supernaturalGenre.id },
        ],
      },
    },
  });

  // Chapters & Pages for Solo Leveling
  const chapter1SL = await prisma.chapter.create({
    data: {
      seriesId: soloLeveling.id,
      number: 1,
      title: 'Chapter 1: The E-Rank Hunter',
      pages: {
        create: [
          {
            pageNumber: 1,
            imageUrl: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=800&auto=format&fit=crop&q=80',
            width: 800,
            height: 1200,
          },
          {
            pageNumber: 2,
            imageUrl: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=800&auto=format&fit=crop&q=80',
            width: 800,
            height: 1200,
          },
          {
            pageNumber: 3,
            imageUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80',
            width: 800,
            height: 1200,
          },
          {
            pageNumber: 4,
            imageUrl: 'https://images.unsplash.com/photo-1563089145-599997674d42?w=800&auto=format&fit=crop&q=80',
            width: 800,
            height: 1200,
          },
        ],
      },
    },
  });

  const chapter2SL = await prisma.chapter.create({
    data: {
      seriesId: soloLeveling.id,
      number: 2,
      title: 'Chapter 2: The Double Dungeon',
      pages: {
        create: [
          {
            pageNumber: 1,
            imageUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&auto=format&fit=crop&q=80',
            width: 800,
            height: 1200,
          },
          {
            pageNumber: 2,
            imageUrl: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800&auto=format&fit=crop&q=80',
            width: 800,
            height: 1200,
          },
          {
            pageNumber: 3,
            imageUrl: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=800&auto=format&fit=crop&q=80',
            width: 800,
            height: 1200,
          },
        ],
      },
    },
  });

  // Chapters & Pages for ORV
  await prisma.chapter.create({
    data: {
      seriesId: orv.id,
      number: 1,
      title: 'Chapter 1: Starting the Paid Service',
      pages: {
        create: [
          {
            pageNumber: 1,
            imageUrl: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800&auto=format&fit=crop&q=80',
            width: 800,
            height: 1200,
          },
          {
            pageNumber: 2,
            imageUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80',
            width: 800,
            height: 1200,
          },
        ],
      },
    },
  });

  // Chapters & Pages for TOG
  await prisma.chapter.create({
    data: {
      seriesId: tog.id,
      number: 1,
      title: 'Chapter 1: Bam & Rachel',
      pages: {
        create: [
          {
            pageNumber: 1,
            imageUrl: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=800&auto=format&fit=crop&q=80',
            width: 800,
            height: 1200,
          },
          {
            pageNumber: 2,
            imageUrl: 'https://images.unsplash.com/photo-1563089145-599997674d42?w=800&auto=format&fit=crop&q=80',
            width: 800,
            height: 1200,
          },
        ],
      },
    },
  });

  console.log('✅ Database Seeded Successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
