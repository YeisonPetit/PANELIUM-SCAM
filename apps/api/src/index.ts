import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { prisma } from './lib/prisma';
import { checkRedisHealth, redis } from './lib/redis';
import { startBackgroundSync } from './lib/sync';
import {
  hashPassword,
  verifyPassword,
  generateToken,
  requireAuth,
  requireAdmin,
  optionalAuth,
  AuthenticatedRequest,
} from './lib/auth';
import { Role } from '@prisma/client';

const app = express();
const port = process.env.PORT || 4000;

// Trust proxy headers (needed for correct IP behind Docker/nginx)
app.set('trust proxy', 1);

// CORS first — must handle preflight before Helmet modifies headers
app.use(cors({ origin: '*' }));

// Security HTTP Headers
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false, // disabled: frontend is separate Vite app
  })
);

app.use(express.json({ limit: '1mb' }));

// Strict Rate Limiter for Import Actions only (100 per 15 min per IP)
// Reading, browsing, and image proxying are NOT rate-limited
const importLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Import rate limit exceeded. Please wait 15 minutes.' },
});


// SSRF Safety Check for Image Proxy
function isSafeUrl(targetUrl: string): boolean {
  try {
    const parsed = new URL(targetUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;

    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('169.254.') ||
      hostname.endsWith('.internal') ||
      hostname.endsWith('.local')
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

// Comprehensive Health Check Endpoint
app.get('/health', async (req: Request, res: Response) => {
  let postgresConnected = false;
  let redisConnected = false;

  try {
    await prisma.$queryRaw`SELECT 1`;
    postgresConnected = true;
  } catch (err) {
    console.error('PostgreSQL connection check failed:', err);
  }

  try {
    redisConnected = await checkRedisHealth();
  } catch (err) {
    console.error('Redis connection check failed:', err);
  }

  const isHealthy = postgresConnected && redisConnected;
  
  res.status(isHealthy ? 200 : 500).json({
    status: isHealthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    services: {
      postgres: postgresConnected ? 'connected' : 'disconnected',
      redis: redisConnected ? 'connected' : 'disconnected',
    },
  });
});

// Auto-seed default administrator account if none exists
async function ensureAdminUser() {
  try {
    const adminCount = await prisma.user.count({ where: { role: Role.ADMIN } });
    if (adminCount === 0) {
      const hashedPassword = await hashPassword('Admin123!');
      await prisma.user.create({
        data: {
          username: 'admin',
          email: 'admin@panelium.com',
          password: hashedPassword,
          role: Role.ADMIN,
        },
      });
      console.log('👑 Cuenta de Administrador creada por defecto: (Usuario: admin, Email: admin@panelium.com, Pass: Admin123!)');
    }
  } catch (err) {
    console.error('Error al inicializar usuario administrador:', err);
  }
}

// POST /api/auth/register - Registrar nuevo usuario estándar
app.post('/api/auth/register', async (req: Request, res: Response) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Nombre de usuario, email y contraseña requeridos.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
    }

    const cleanUsername = username.trim().toLowerCase();
    const cleanEmail = email.trim().toLowerCase();

    const existing = await prisma.user.findFirst({
      where: { OR: [{ email: cleanEmail }, { username: cleanUsername }] },
    });

    if (existing) {
      if (existing.email.toLowerCase() === cleanEmail) {
        return res.status(409).json({ error: 'Ya existe una cuenta con este correo electrónico.' });
      }
      return res.status(409).json({ error: 'El nombre de usuario ya está en uso.' });
    }

    const hashedPassword = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        username: cleanUsername,
        email: cleanEmail,
        password: hashedPassword,
        role: Role.USER,
      },
      select: { id: true, username: true, email: true, role: true, avatar: true, createdAt: true },
    });

    const token = generateToken({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    });

    return res.status(201).json({ token, user });
  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({ error: 'Error al registrar el usuario.' });
  }
});

// POST /api/auth/login - Iniciar sesión (Usuario o Admin)
app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({ error: 'Identificador y contraseña requeridos.' });
    }

    const cleanIdent = identifier.trim().toLowerCase();

    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: cleanIdent }, { username: cleanIdent }],
      },
    });

    if (!user) {
      return res.status(401).json({ error: 'Credenciales inválidas. Verifica tu correo o usuario.' });
    }

    const validPassword = await verifyPassword(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciales inválidas. Contraseña incorrecta.' });
    }

    const token = generateToken({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    });

    return res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Error al iniciar sesión.' });
  }
});

// GET /api/auth/me - Obtener perfil del usuario autenticado
app.get('/api/auth/me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, username: true, email: true, role: true, avatar: true, createdAt: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    return res.json({ user });
  } catch (error) {
    console.error('Auth me error:', error);
    return res.status(500).json({ error: 'Error al obtener perfil de usuario.' });
  }
});

// GET /api/user/favorites - Obtener favoritos sincronizados con la BD
app.get('/api/user/favorites', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const favs = await prisma.favorite.findMany({
      where: { userId: req.user!.id },
      include: {
        series: {
          select: {
            id: true,
            title: true,
            slug: true,
            cover: true,
            status: true,
            type: true,
          },
        },
      },
    });

    return res.json({ favorites: favs.map((f) => f.series) });
  } catch (error) {
    console.error('Get favorites error:', error);
    return res.status(500).json({ error: 'Error al obtener favoritos.' });
  }
});

// POST /api/user/favorites/:seriesId - Alternar favorito en BD
app.post('/api/user/favorites/:seriesId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { seriesId } = req.params;
    const userId = req.user!.id;

    const series = await prisma.series.findFirst({
      where: { OR: [{ id: seriesId }, { slug: seriesId }] },
    });

    if (!series) {
      return res.status(404).json({ error: 'Serie no encontrada.' });
    }

    const existingFav = await prisma.favorite.findUnique({
      where: {
        userId_seriesId: {
          userId,
          seriesId: series.id,
        },
      },
    });

    if (existingFav) {
      await prisma.favorite.delete({
        where: { userId_seriesId: { userId, seriesId: series.id } },
      });
      return res.json({ isFavorite: false });
    } else {
      await prisma.favorite.create({
        data: { userId, seriesId: series.id },
      });
      return res.json({ isFavorite: true });
    }
  } catch (error) {
    console.error('Toggle favorite error:', error);
    return res.status(500).json({ error: 'Error al modificar favoritos.' });
  }
});

// GET /api/user/history - Obtener historial de lectura del usuario
app.get('/api/user/history', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const history = await prisma.history.findMany({
      where: { userId: req.user!.id },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      include: {
        chapter: {
          include: {
            series: {
              select: {
                id: true,
                title: true,
                slug: true,
                cover: true,
              },
            },
          },
        },
      },
    });

    return res.json({ history });
  } catch (error) {
    console.error('Get history error:', error);
    return res.status(500).json({ error: 'Error al obtener historial.' });
  }
});

// POST /api/user/history - Guardar progreso de lectura
app.post('/api/user/history', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { chapterId, page = 1 } = req.body;
    const userId = req.user!.id;

    if (!chapterId) {
      return res.status(400).json({ error: 'chapterId requerido.' });
    }

    const history = await prisma.history.upsert({
      where: {
        userId_chapterId: {
          userId,
          chapterId,
        },
      },
      update: { page, updatedAt: new Date() },
      create: { userId, chapterId, page },
    });

    return res.json({ success: true, history });
  } catch (error) {
    console.error('Save history error:', error);
    return res.status(500).json({ error: 'Error al guardar historial.' });
  }
});

// GET /api/series - List all series with genre details
app.get('/api/series', async (req: Request, res: Response) => {

  try {
    const { search, type, status, genre, sortBy } = req.query;

    const cacheKey = `api:series:${JSON.stringify(req.query)}`;
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return res.json({ source: 'redis', data: JSON.parse(cached) });
      }
    } catch (cacheErr) {
      // Fallback to database
    }

    const where: any = {};

    if (search && typeof search === 'string' && search.trim() !== '') {
      const q = search.trim();
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { author: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (type && typeof type === 'string' && type !== 'ALL') {
      where.type = type.toUpperCase();
    }

    if (status && typeof status === 'string' && status !== 'ALL') {
      where.status = status.toUpperCase();
    }

    if (genre && typeof genre === 'string' && genre !== 'ALL') {
      where.genres = {
        some: {
          genre: {
            name: { equals: genre, mode: 'insensitive' },
          },
        },
      };
    }

    let orderByClause: any = { createdAt: 'desc' };
    if (sortBy === 'title') {
      orderByClause = { title: 'asc' };
    } else if (sortBy === 'year') {
      orderByClause = { releaseYear: 'desc' };
    }

    const seriesList = await prisma.series.findMany({
      where,
      include: {
        genres: {
          include: {
            genre: true,
          },
        },
        chapters: {
          orderBy: { number: 'desc' },
          take: 2,
          select: { id: true, number: true, title: true, createdAt: true },
        },
        _count: {
          select: { chapters: true },
        },
      },
      orderBy: orderByClause,
    });

    type SeriesItem = (typeof seriesList)[number];
    let formatted = seriesList.map((s: SeriesItem) => ({
      ...s,
      genres: s.genres.map((g: any) => g.genre.name),
      chapterCount: s._count.chapters,
      latestChapters: s.chapters,
      updatedAt: s.chapters[0]?.createdAt || s.createdAt,
    }));


    if (sortBy === 'update') {
      formatted.sort((a: any, b: any) => {
        const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return timeB - timeA;
      });
    } else if (sortBy === 'chapters') {
      formatted.sort((a: any, b: any) => b.chapterCount - a.chapterCount);
    }

    try {
      await redis.set(cacheKey, JSON.stringify(formatted), 'EX', 60);
    } catch (cacheErr) {}

    return res.json({ source: 'database', data: formatted });
  } catch (error) {
    console.error('Error fetching series list:', error);
    return res.status(500).json({ error: 'Failed to fetch series catalog' });
  }
});

// GET /api/stats - Admin overview stats
app.get('/api/stats', async (req: Request, res: Response) => {
  try {
    const [seriesCount, chapterCount, pageCount] = await Promise.all([
      prisma.series.count(),
      prisma.chapter.count(),
      prisma.page.count(),
    ]);
    return res.json({ seriesCount, chapterCount, pageCount });
  } catch (error) {
    console.error('Error fetching stats:', error);
    return res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// DELETE /api/series/:slug - Delete a series and all its data (Admin Only)
app.delete('/api/series/:slug', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const series = await prisma.series.findUnique({ where: { slug } });
    if (!series) return res.status(404).json({ error: 'Series not found' });

    // Delete in cascade order: pages → chapters → genres → series
    const chapters = await prisma.chapter.findMany({
      where: { seriesId: series.id },
      select: { id: true },
    });
    const chapterIds = chapters.map((c) => c.id);
    await prisma.page.deleteMany({ where: { chapterId: { in: chapterIds } } });
    await prisma.chapter.deleteMany({ where: { seriesId: series.id } });
    await prisma.seriesGenre.deleteMany({ where: { seriesId: series.id } });
    await prisma.series.delete({ where: { id: series.id } });

    // Invalidate Redis cache
    try {
      const keys = await redis.keys('api:series:*');
      if (keys.length > 0) await redis.del(...keys);
    } catch {}

    return res.json({ success: true, deleted: slug });
  } catch (error) {
    console.error('Error deleting series:', error);
    return res.status(500).json({ error: 'Failed to delete series' });
  }
});

// PATCH /api/series/:slug - Edit series metadata (Admin Only)
app.patch('/api/series/:slug', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const { title, description, status, cover } = req.body;

    const series = await prisma.series.findUnique({ where: { slug } });
    if (!series) return res.status(404).json({ error: 'Series not found' });

    const updated = await prisma.series.update({
      where: { slug },
      data: {
        ...(title && typeof title === 'string' ? { title } : {}),
        ...(description && typeof description === 'string' ? { description } : {}),
        ...(status && ['ONGOING', 'COMPLETED', 'HIATUS', 'CANCELLED'].includes(status) ? { status } : {}),
        ...(cover && typeof cover === 'string' ? { cover } : {}),
      },
    });

    // Invalidate Redis cache
    try {
      const keys = await redis.keys('api:series:*');
      if (keys.length > 0) await redis.del(...keys);
    } catch {}

    return res.json({ success: true, series: updated });
  } catch (error) {
    console.error('Error updating series:', error);
    return res.status(500).json({ error: 'Failed to update series' });
  }
});

// POST /api/series/:slug/sync - Force re-sync a series from its source (Admin Only)
app.post('/api/series/:slug/sync', requireAdmin, importLimiter, async (req: Request, res: Response) => {

  try {
    const { slug } = req.params;
    const series = await prisma.series.findUnique({
      where: { slug },
      select: { id: true, sourceUrl: true, title: true },
    });
    if (!series) return res.status(404).json({ error: 'Series not found' });
    if (!series.sourceUrl) return res.status(400).json({ error: 'Series has no sourceUrl for sync' });

    // Parse source prefix: "weebcentral:<id>" or "mangadex:<id>"
    const [sourcePrefix, ...idParts] = series.sourceUrl.split(':');
    const sourceId = idParts.join(':'); // rejoin in case id itself contains colons

    let updated;
    if (sourcePrefix === 'mangadex') {
      const { importMangaDexSeries } = await import('./lib/mangadex');
      updated = await importMangaDexSeries(sourceId, ['en']);
    } else {
      // Default: weebcentral
      const { importWeebCentralSeries } = await import('./lib/weebcentral');
      updated = await importWeebCentralSeries(sourceId);
    }

    // Invalidate Redis cache
    try {
      const keys = await redis.keys('api:series:*');
      if (keys.length > 0) await redis.del(...keys);
    } catch {}

    return res.json({ success: true, series: updated });
  } catch (error: any) {
    console.error('Error syncing series:', error);
    return res.status(500).json({ error: 'Failed to sync series' });
  }
});

// GET /api/series/:slug - Single series details with chapter list
app.get('/api/series/:slug', async (req: Request, res: Response) => {

  try {
    const { slug } = req.params;
    const series = await prisma.series.findUnique({
      where: { slug },
      include: {
        genres: {
          include: { genre: true },
        },
        chapters: {
          orderBy: { number: 'asc' },
          include: {
            _count: { select: { pages: true } },
          },
        },
      },
    });

    if (!series) {
      return res.status(404).json({ error: 'Series not found' });
    }

    type ChapterItem = (typeof series.chapters)[number];
    type GenreItem = (typeof series.genres)[number];

    const formatted = {
      ...series,
      genres: series.genres.map((g: GenreItem) => g.genre.name),
      chapters: series.chapters.map((c: ChapterItem) => ({
        id: c.id,
        number: c.number,
        title: c.title,
        createdAt: c.createdAt,
        pageCount: c._count.pages,
      })),
    };

    return res.json(formatted);
  } catch (error) {
    console.error('Error fetching series by slug:', error);
    return res.status(500).json({ error: 'Failed to fetch series details' });
  }
});

// GET /api/chapters/latest - Get recently added chapters
app.get('/api/chapters/latest', async (req: Request, res: Response) => {
  try {
    const latest = await prisma.chapter.findMany({
      orderBy: { createdAt: 'desc' },
      take: 12,
      include: {
        series: {
          select: {
            title: true,
            slug: true,
            cover: true,
          },
        },
      },
    });
    return res.json(latest);
  } catch (error) {
    console.error('Error fetching latest chapters:', error);
    return res.status(500).json({ error: 'Failed to fetch latest chapters' });
  }
});

// GET /api/chapters/:id - Get chapter pages for reading
app.get('/api/chapters/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    let chapter = await prisma.chapter.findUnique({
      where: { id },
      include: {
        series: {
          select: { id: true, title: true, slug: true },
        },
        pages: {
          orderBy: { pageNumber: 'asc' },
        },
      },
    });

    if (!chapter) {
      return res.status(404).json({ error: 'Chapter not found' });
    }

    // Lazy load pages from MangaDex
    if (chapter.pages.length === 0 && chapter.mangadexId) {
      try {
        console.log(`Lazy loading pages from MangaDex for chapter ID ${chapter.id} (mangadexId: ${chapter.mangadexId})...`);
        const atHomeRes = await fetch(`https://api.mangadex.org/at-home/server/${chapter.mangadexId}`);
        if (atHomeRes.ok) {
          const atHomeJson = await atHomeRes.json();
          const baseUrl = atHomeJson.baseUrl;
          const hash = atHomeJson.chapter?.hash;
          const pageFiles = atHomeJson.chapter?.data || [];

          if (baseUrl && hash && pageFiles.length > 0) {
            const pagesData = pageFiles.map((f: string, idx: number) => ({
              chapterId: chapter!.id,
              pageNumber: idx + 1,
              imageUrl: `${baseUrl}/data/${hash}/${f}`,
              width: 800,
              height: 1200,
            }));

            // Bulk insert pages
            await prisma.page.createMany({
              data: pagesData,
            });

            // Reload chapter with pages
            chapter = await prisma.chapter.findUnique({
              where: { id },
              include: {
                series: { select: { id: true, title: true, slug: true } },
                pages: { orderBy: { pageNumber: 'asc' } },
              },
            }) || chapter;
          }
        }
      } catch (err) {
        console.error('Failed to lazy load pages from MangaDex:', err);
      }
    } else if (chapter.pages.length === 0 && chapter.sourceUrl && !chapter.sourceUrl.includes('manganato')) {
      // Lazy load pages from WeebCentral (assuming sourceUrl is the chapter ID for WeebCentral)
      try {
        console.log(`Lazy loading pages from WeebCentral for chapter ID ${chapter.id} (url: ${chapter.sourceUrl})...`);
        const { getWeebCentralChapterPages } = await import('./lib/weebcentral');
        const pageUrls = await getWeebCentralChapterPages(chapter.sourceUrl);

        if (pageUrls.length > 0) {
          const pagesData = pageUrls.map((p, idx: number) => ({
            chapterId: chapter!.id,
            pageNumber: idx + 1,
            // Proxy the image URL to bypass referer blocks
            imageUrl: `/api/proxy-image?url=${encodeURIComponent(p.url)}&referer=${encodeURIComponent(p.referer)}`,
            width: 800,
            height: 1200,
          }));

          // Bulk insert pages
          await prisma.page.createMany({
            data: pagesData,
          });

          // Reload chapter with pages
          chapter = await prisma.chapter.findUnique({
            where: { id },
            include: {
              series: { select: { id: true, title: true, slug: true } },
              pages: { orderBy: { pageNumber: 'asc' } },
            },
          }) || chapter;
        }
      } catch (err) {
        console.error('Failed to lazy load pages from WeebCentral:', err);
      }
    }

    const allChapters = await prisma.chapter.findMany({
      where: { seriesId: chapter.seriesId },
      select: { id: true, number: true },
      orderBy: { number: 'asc' },
    });

    type ChapterSimple = (typeof allChapters)[number];
    const currentIndex = allChapters.findIndex((c: ChapterSimple) => c.id === chapter!.id);
    const prevChapter = currentIndex > 0 ? allChapters[currentIndex - 1] : null;
    const nextChapter = currentIndex < allChapters.length - 1 ? allChapters[currentIndex + 1] : null;

    return res.json({
      ...chapter,
      prevChapterId: prevChapter?.id || null,
      nextChapterId: nextChapter?.id || null,
    });
  } catch (error) {
    console.error('Error fetching chapter:', error);
    return res.status(500).json({ error: 'Failed to fetch chapter' });
  }
});

// GET /api/mangadex/search - Search MangaDex catalog
app.get('/api/mangadex/search', async (req: Request, res: Response) => {
  try {
    const q = (req.query.q as string) || '';
    const results = await import('./lib/mangadex').then((m) => m.searchMangaDex(q));
    return res.json({ data: results });
  } catch (error) {
    console.error('MangaDex search endpoint error:', error);
    return res.status(500).json({ error: 'Failed to search MangaDex' });
  }
});

// POST /api/mangadex/import - Import MangaDex series to local database (Admin Only)
app.post('/api/mangadex/import', requireAdmin, importLimiter, async (req: Request, res: Response) => {
  try {
    const { mangaDexId, languages } = req.body;
    if (!mangaDexId || typeof mangaDexId !== 'string') {
      return res.status(400).json({ error: 'Valid mangaDexId string is required' });
    }

    const { importMangaDexSeries } = await import('./lib/mangadex');
    const series = await importMangaDexSeries(mangaDexId, languages || ['es', 'es-la', 'en']);
    return res.json({ success: true, series });
  } catch (error: any) {
    console.error('MangaDex import endpoint error:', error);
    return res.status(500).json({ error: 'Failed to import series from MangaDex' });
  }
});

// GET /api/manganato/search - Search Manganato catalog (Now mapped to WeebCentral under the hood)
app.get('/api/manganato/search', async (req: Request, res: Response) => {
  try {
    const q = (req.query.q as string) || '';
    // When no query, search popular manhwa terms to populate the default view
    const searchTerm = q.trim() || 'solo leveling';
    const results = await import('./lib/weebcentral').then((m) => m.searchWeebCentral(searchTerm));
    return res.json({ data: results });
  } catch (error) {
    console.error('WeebCentral search endpoint error:', error);
    return res.status(500).json({ error: 'Failed to search WeebCentral' });
  }
});

// POST /api/manganato/import - Import Manganato series to local database (Admin Only)
app.post('/api/manganato/import', requireAdmin, importLimiter, async (req: Request, res: Response) => {
  try {
    const { seriesId } = req.body;
    if (!seriesId || typeof seriesId !== 'string') {
      return res.status(400).json({ error: 'Valid seriesId string is required' });
    }

    const { importWeebCentralSeries } = await import('./lib/weebcentral');
    const series = await importWeebCentralSeries(seriesId);
    return res.json({ success: true, series });
  } catch (error: any) {
    console.error('WeebCentral import endpoint error:', error);
    return res.status(500).json({ error: 'Failed to import series' });
  }
});

import http from 'http';
import https from 'https';

const proxyHttpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 300,
  maxFreeSockets: 50,
  timeout: 20000,
  rejectUnauthorized: false,
});

const proxyHttpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 300,
  maxFreeSockets: 50,
  timeout: 20000,
});

function fetchImageWithNode(
  targetUrl: string,
  headers: Record<string, string>,
  maxRedirects = 3
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; stream: http.IncomingMessage }> {
  return new Promise((resolve, reject) => {
    try {
      const parsed = new URL(targetUrl);
      const isHttps = parsed.protocol === 'https:';
      const client = isHttps ? https : http;
      const agent = isHttps ? proxyHttpsAgent : proxyHttpAgent;

      const req = client.get(
        {
          protocol: parsed.protocol,
          hostname: parsed.hostname,
          port: parsed.port || (isHttps ? 443 : 80),
          path: parsed.pathname + parsed.search,
          headers: {
            ...headers,
            Host: parsed.hostname,
          },
          servername: parsed.hostname,
          agent,
          timeout: 15000,
          rejectUnauthorized: false,
        } as any,
        (res) => {
          if (
            (res.statusCode === 301 ||
              res.statusCode === 302 ||
              res.statusCode === 307 ||
              res.statusCode === 308) &&
            res.headers.location &&
            maxRedirects > 0
          ) {
            res.resume();
            const redirectUrl = new URL(res.headers.location, targetUrl).toString();
            return resolve(fetchImageWithNode(redirectUrl, headers, maxRedirects - 1));
          }
          resolve({ statusCode: res.statusCode || 500, headers: res.headers, stream: res });
        }
      );

      req.on('error', (err) => reject(err));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
    } catch (err) {
      reject(err);
    }
  });
}

// GET /api/proxy-image - Proxy image requests to bypass referer blocks securely
app.get('/api/proxy-image', async (req: Request, res: Response) => {
  try {
    const { url, referer } = req.query;
    if (!url || typeof url !== 'string') {
      return res.status(400).send('Image URL is required');
    }

    if (!isSafeUrl(url)) {
      return res.status(400).send('Invalid or restricted target URL');
    }

    const targetUrl = url.trim();
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(targetUrl);
    } catch {
      return res.status(400).send('Invalid URL format');
    }

    let refString = typeof referer === 'string' && referer.trim() ? referer.trim() : '';
    if (refString && !refString.endsWith('/')) {
      refString += '/';
    }

    // Multiple header strategies
    const strategies: Record<string, string>[] = [
      // 1. Provided Referer
      ...(refString
        ? [
            {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
              Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.9',
              Referer: refString,
            },
          ]
        : []),
      // 2. WeebCentral referer
      {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: 'https://weebcentral.com/',
      },
      // 3. Host domain referer
      {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        Referer: `${parsedUrl.protocol}//${parsedUrl.host}/`,
      },
      // 4. Clean request without referer
      {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
    ];

    for (const headers of strategies) {
      try {
        const result = await fetchImageWithNode(targetUrl, headers);
        if (result.statusCode >= 200 && result.statusCode < 300) {
          const contentType = (result.headers['content-type'] as string) || 'image/jpeg';
          res.setHeader('Content-Type', contentType);
          res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
          res.setHeader('Access-Control-Allow-Origin', '*');

          result.stream.pipe(res);
          return;
        } else {
          result.stream.resume();
        }
      } catch {
        // try next strategy
      }
    }

    if (!res.headersSent) {
      // Fallback: Redirect directly to target URL so browser loads it seamlessly
      return res.redirect(302, targetUrl);
    }
  } catch (error) {
    console.error('Proxy image error:', error);
    if (!res.headersSent) {
      const { url } = req.query;
      if (typeof url === 'string') {
        return res.redirect(302, url);
      }
      res.status(500).send('Internal Server Error');
    }
  }
});


// GET /sitemap.xml - Dynamic XML sitemap for SEO crawlers
app.get('/sitemap.xml', async (req: Request, res: Response) => {
  try {
    const series = await prisma.series.findMany({
      select: { slug: true, createdAt: true },
    });

    const host = req.get('host') || 'localhost:4000';
    const protocol = req.protocol || 'http';

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
    xml += `  <url>\n    <loc>${protocol}://${host}/</loc>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n`;

    for (const s of series) {
      xml += `  <url>\n    <loc>${protocol}://${host}/series/${s.slug}</loc>\n    <lastmod>${s.createdAt.toISOString().split('T')[0]}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
    }

    xml += `</urlset>`;

    res.header('Content-Type', 'application/xml');
    return res.send(xml);
  } catch (error) {
    console.error('Error generating sitemap:', error);
    return res.status(500).send('Error generating sitemap');
  }
});

// Centralized JSON Error Handler
app.use((err: any, req: Request, res: Response, next: any) => {
  console.error('Unhandled API Error:', err);
  if (res.headersSent) {
    return next(err);
  }
  const status = err.status || err.statusCode || 500;
  return res.status(status).json({
    error: err.message || 'Error interno en el servidor',
  });
});

app.listen(port, async () => {
  console.log(`🚀 PaneliumScan API listening on port ${port}`);
  await ensureAdminUser();
  startBackgroundSync();
});

