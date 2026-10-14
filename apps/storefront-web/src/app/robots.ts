import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/bff/', '/ar/account', '/en/account', '/ar/login', '/en/login'] }],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
