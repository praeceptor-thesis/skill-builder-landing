import { Helmet } from 'react-helmet-async';

const SITE_NAME = 'Skill Builder';
const SITE_URL = 'https://skill-builder.ai';
const DEFAULT_IMAGE = '/og-image.png';

type Meta = { name?: string; property?: string; content: string };

export function SEOHead({
  title,
  description,
  canonicalUrl,
  image,
  type = 'website',
  publishedTime,
  author,
  tags,
  noindex,
}: {
  title: string;
  description: string;
  canonicalUrl?: string;
  image?: string;
  type?: 'website' | 'article' | 'product';
  publishedTime?: string;
  author?: string;
  tags?: string[];
  noindex?: boolean;
}) {
  const fullTitle = `${title} | ${SITE_NAME}`;
  const url = canonicalUrl || SITE_URL;
  const ogImage = image || DEFAULT_IMAGE;

  const meta: Meta[] = [
    { name: 'description', content: description },
    { property: 'og:title', content: fullTitle },
    { property: 'og:description', content: description },
    { property: 'og:url', content: url },
    { property: 'og:type', content: type },
    { property: 'og:image', content: ogImage },
    { property: 'og:site_name', content: SITE_NAME },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: fullTitle },
    { name: 'twitter:description', content: description },
    { name: 'twitter:image', content: ogImage },
    { name: 'twitter:site', content: '@skillbuilder' },
  ];

  if (publishedTime) {
    meta.push({ name: 'article:published_time', content: publishedTime });
    meta.push({ name: 'article:modified_time', content: publishedTime });
  }

  if (author) {
    meta.push({ name: 'article:author', content: author });
  }

  if (tags?.length) {
    tags.forEach((tag) => {
      meta.push({ name: 'article:tag', content: tag });
    });
  }

  if (canonicalUrl) {
    meta.push({ name: 'canonical', content: canonicalUrl });
  }

  if (noindex) {
    meta.push({ name: 'robots', content: 'noindex, nofollow' });
  }

  return (
    <Helmet>
      <title>{fullTitle}</title>
      {canonicalUrl && <link rel="canonical" href={canonicalUrl} />}
      {meta.map((m, i) => {
        if (m.name) return <meta key={i} name={m.name} content={m.content} />;
        if (m.property) return <meta key={i} property={m.property} content={m.content} />;
        return null;
      })}
    </Helmet>
  );
}

export function SitemapLink() {
  return (
    <Helmet>
      <link rel="sitemap" type="application/xml" href="/sitemap.xml" />
    </Helmet>
  );
}
