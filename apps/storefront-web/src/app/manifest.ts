import type { MetadataRoute } from 'next';

/** PWA manifest. Arabic-first: RTL direction and Arabic name by default. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'هدهد | HUDHUD',
    short_name: 'هدهد',
    description: 'ستائر ومفروشات وعبايات بلمسة أنيقة',
    lang: 'ar',
    dir: 'rtl',
    start_url: '/ar',
    scope: '/',
    display: 'standalone',
    background_color: '#fbf9f5',
    theme_color: '#2f6f6a',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  };
}
