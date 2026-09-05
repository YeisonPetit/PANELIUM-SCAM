import { prisma } from './prisma';

export interface ChapterNotification {
  id: string;
  type: 'NEW_CHAPTER' | 'MULTIPLE_NEW' | 'START_READING' | 'UP_TO_DATE';
  chapterId: string;
  chapterNumber: number;
  chapterTitle?: string | null;
  seriesId: string;
  seriesTitle: string;
  seriesSlug: string;
  seriesCover: string;
  message: string;
  badgeText: string;
  unreadCount: number;
  createdAt: string;
  isRead: boolean;
}

/**
 * Get intelligent chapter notifications grouped by favorited series.
 * Avoids spamming notifications for old chapters when a user favorites a series.
 */
export async function getUserNotifications(userId: string): Promise<{
  unreadCount: number;
  notifications: ChapterNotification[];
}> {
  try {
    const favorites = await prisma.favorite.findMany({
      where: { userId },
      include: {
        series: {
          include: {
            chapters: {
              select: {
                id: true,
                number: true,
                title: true,
                createdAt: true,
              },
              orderBy: { number: 'asc' },
            },
          },
        },
      },
    });

    if (favorites.length === 0) {
      return { unreadCount: 0, notifications: [] };
    }

    // Fetch user's read history
    const userHistory = await prisma.history.findMany({
      where: { userId },
      select: { chapterId: true },
    });
    const readChapterIds = new Set(userHistory.map((h) => h.chapterId));

    const notifications: ChapterNotification[] = [];

    for (const fav of favorites) {
      const series = fav.series;
      if (!series || !series.chapters || series.chapters.length === 0) {
        continue;
      }

      const chapters = series.chapters;
      const firstChapter = chapters[0];
      const latestChapter = chapters[chapters.length - 1];

      // Find chapters read by user for this series
      const readChaptersInSeries = chapters.filter((c) => readChapterIds.has(c.id));

      if (readChaptersInSeries.length === 0) {
        // User has NOT read any chapter yet.
        // Single clean recommendation without triggering unread badge spam.
        notifications.push({
          id: `notif-fav-${series.id}`,
          type: 'START_READING',
          chapterId: firstChapter.id,
          chapterNumber: firstChapter.number,
          chapterTitle: firstChapter.title,
          seriesId: series.id,
          seriesTitle: series.title,
          seriesSlug: series.slug,
          seriesCover: series.cover,
          message: `In your Favorites: Start reading from Chapter ${firstChapter.number}`,
          badgeText: 'Start Reading',
          unreadCount: 0,
          createdAt: latestChapter.createdAt.toISOString(),
          isRead: true, // Do not spam red alert badge for unstarted series
        });
        continue;
      }

      // User has read some chapters. Find highest chapter number read.
      const highestReadNumber = Math.max(...readChaptersInSeries.map((c) => c.number));
      const unreadChapters = chapters.filter((c) => c.number > highestReadNumber);

      if (unreadChapters.length === 0) {
        // User is completely up to date with latest chapter
        notifications.push({
          id: `notif-fav-${series.id}`,
          type: 'UP_TO_DATE',
          chapterId: latestChapter.id,
          chapterNumber: latestChapter.number,
          chapterTitle: latestChapter.title,
          seriesId: series.id,
          seriesTitle: series.title,
          seriesSlug: series.slug,
          seriesCover: series.cover,
          message: `You're all caught up with Chapter ${latestChapter.number}!`,
          badgeText: 'Up to date',
          unreadCount: 0,
          createdAt: latestChapter.createdAt.toISOString(),
          isRead: true,
        });
      } else if (unreadChapters.length === 1) {
        // Exactly 1 new chapter released
        const newChap = unreadChapters[0];
        notifications.push({
          id: `notif-chap-${newChap.id}`,
          type: 'NEW_CHAPTER',
          chapterId: newChap.id,
          chapterNumber: newChap.number,
          chapterTitle: newChap.title,
          seriesId: series.id,
          seriesTitle: series.title,
          seriesSlug: series.slug,
          seriesCover: series.cover,
          message: `New Chapter ${newChap.number} is out!`,
          badgeText: 'New Chapter',
          unreadCount: 1,
          createdAt: newChap.createdAt.toISOString(),
          isRead: false,
        });
      } else {
        // Multiple new chapters released
        const firstUnread = unreadChapters[0];
        const lastUnread = unreadChapters[unreadChapters.length - 1];
        notifications.push({
          id: `notif-chap-${firstUnread.id}`,
          type: 'MULTIPLE_NEW',
          chapterId: firstUnread.id,
          chapterNumber: firstUnread.number,
          chapterTitle: firstUnread.title,
          seriesId: series.id,
          seriesTitle: series.title,
          seriesSlug: series.slug,
          seriesCover: series.cover,
          message: `${unreadChapters.length} new chapters available (Ch. ${firstUnread.number} - ${lastUnread.number})`,
          badgeText: `${unreadChapters.length} New`,
          unreadCount: unreadChapters.length,
          createdAt: lastUnread.createdAt.toISOString(),
          isRead: false,
        });
      }
    }

    // Sort notifications: unread first, then latest createdAt
    notifications.sort((a, b) => {
      if (a.isRead !== b.isRead) {
        return a.isRead ? 1 : -1;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    const totalUnread = notifications.filter((n) => !n.isRead).length;

    return {
      unreadCount: totalUnread,
      notifications,
    };
  } catch (error) {
    console.error('Error fetching user notifications:', error);
    return { unreadCount: 0, notifications: [] };
  }
}

