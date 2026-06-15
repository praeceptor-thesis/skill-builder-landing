import type { Skill } from '../services/api';

type JsonLdValue = string | number | boolean | null | JsonLdValue[] | { [key: string]: JsonLdValue };

export function SkillJsonLd({ skill, url }: { skill: Skill; url: string }) {
  const jsonLd: Record<string, JsonLdValue> = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: skill.name,
    description: skill.description,
    applicationCategory: 'AI Skill',
    operatingSystem: 'Any',
    url,
    datePublished: skill.createdAt,
    dateModified: skill.updatedAt,
    version: skill.version,
    author: {
      '@type': 'Person',
      name: skill.author.name,
    },
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    keywords: skill.tags.join(', '),
    ...(skill.spec?.purpose ? { about: skill.spec.purpose } : {}),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

export function BreadcrumbJsonLd({ items }: {
  items: { name: string; url: string }[];
}) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
