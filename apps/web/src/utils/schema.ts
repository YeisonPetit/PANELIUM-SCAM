export interface SchemaSeriesData {
  title: string;
  slug: string;
  description?: string;
  cover?: string;
  author?: string;
  artist?: string;
  genres?: string[];
  chapters?: any[];
}

export function injectSeriesSchema(series: SchemaSeriesData) {
  const hash = (series.title || '').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const ratingVal = (9.3 + (hash % 6) / 10).toFixed(1);
  const voteCount = 450 + (hash % 500);

  const cleanAuthor = series.author && series.author !== 'Unknown' ? series.author : 'Panelium Studio';
  const cleanDesc = series.description && series.description !== 'No description available.'
    ? series.description
    : `Read ${series.title} online for free in high quality on Panelium Scan.`;

  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ComicSeries',
        '@id': `https://paneliumscan.com/series/${series.slug}#series`,
        'name': series.title,
        'headline': series.title,
        'description': cleanDesc,
        'image': series.cover || 'https://paneliumscan.com/og-image.jpg',
        'inLanguage': 'en',
        'genre': series.genres || [],
        'numberOfEpisodes': series.chapters?.length || 0,
        'author': {
          '@type': 'Person',
          'name': cleanAuthor,
        },
        'publisher': {
          '@type': 'Organization',
          'name': 'Panelium Scan',
          'url': 'https://paneliumscan.com',
          'logo': 'https://paneliumscan.com/favicon.png',
        },
        'aggregateRating': {
          '@type': 'AggregateRating',
          'ratingValue': ratingVal,
          'bestRating': '10',
          'worstRating': '1',
          'ratingCount': voteCount,
        },
      },
      {
        '@type': 'BreadcrumbList',
        'itemListElement': [
          {
            '@type': 'ListItem',
            'position': 1,
            'name': 'Home',
            'item': 'https://paneliumscan.com/',
          },
          {
            '@type': 'ListItem',
            'position': 2,
            'name': series.title,
            'item': `https://paneliumscan.com/series/${series.slug}`,
          },
        ],
      },
    ],
  };

  let scriptEl = document.getElementById('schema-json-ld');
  if (!scriptEl) {
    scriptEl = document.createElement('script');
    scriptEl.id = 'schema-json-ld';
    scriptEl.setAttribute('type', 'application/ld+json');
    document.head.appendChild(scriptEl);
  }
  scriptEl.textContent = JSON.stringify(schema);
}

export function injectChapterSchema(opts: {
  seriesTitle: string;
  seriesSlug: string;
  seriesCover?: string;
  chapterNumber: number | string;
  chapterTitle?: string;
  author?: string;
}) {
  const { seriesTitle, seriesSlug, seriesCover, chapterNumber, chapterTitle, author } = opts;
  const hash = (seriesTitle || '').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const ratingVal = (9.4 + (hash % 5) / 10).toFixed(1);
  const voteCount = 380 + (hash % 450);

  const cleanAuthor = author && author !== 'Unknown' ? author : 'Panelium Studio';

  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ComicIssue',
        'name': `${seriesTitle} — Chapter ${chapterNumber}${chapterTitle ? `: ${chapterTitle}` : ''}`,
        'issueNumber': chapterNumber.toString(),
        'partOfSeries': {
          '@type': 'ComicSeries',
          'name': seriesTitle,
          'url': `https://paneliumscan.com/series/${seriesSlug}`,
        },
        'author': {
          '@type': 'Person',
          'name': cleanAuthor,
        },
        'image': seriesCover || 'https://paneliumscan.com/og-image.jpg',
        'inLanguage': 'en',
        'publisher': {
          '@type': 'Organization',
          'name': 'Panelium Scan',
          'url': 'https://paneliumscan.com',
          'logo': 'https://paneliumscan.com/favicon.png',
        },
        'aggregateRating': {
          '@type': 'AggregateRating',
          'ratingValue': ratingVal,
          'bestRating': '10',
          'worstRating': '1',
          'ratingCount': voteCount,
        },
      },
      {
        '@type': 'BreadcrumbList',
        'itemListElement': [
          {
            '@type': 'ListItem',
            'position': 1,
            'name': 'Home',
            'item': 'https://paneliumscan.com/',
          },
          {
            '@type': 'ListItem',
            'position': 2,
            'name': seriesTitle,
            'item': `https://paneliumscan.com/series/${seriesSlug}`,
          },
          {
            '@type': 'ListItem',
            'position': 3,
            'name': `Chapter ${chapterNumber}`,
            'item': `https://paneliumscan.com/${seriesSlug}/chapter/${chapterNumber}`,
          },
        ],
      },
    ],
  };

  let scriptEl = document.getElementById('schema-json-ld');
  if (!scriptEl) {
    scriptEl = document.createElement('script');
    scriptEl.id = 'schema-json-ld';
    scriptEl.setAttribute('type', 'application/ld+json');
    document.head.appendChild(scriptEl);
  }
  scriptEl.textContent = JSON.stringify(schema);
}
