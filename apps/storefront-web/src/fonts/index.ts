import localFont from 'next/font/local';

// IBM Plex (SIL Open Font License 1.1, see OFL.txt), self-hosted so builds never depend on
// fonts.googleapis.com and visitors' browsers never contact Google.
export const arabic = localFont({
  src: [
    { path: './ibm-plex-sans-arabic-arabic-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './ibm-plex-sans-arabic-arabic-500-normal.woff2', weight: '500', style: 'normal' },
    { path: './ibm-plex-sans-arabic-arabic-600-normal.woff2', weight: '600', style: 'normal' },
    { path: './ibm-plex-sans-arabic-arabic-700-normal.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-arabic',
  display: 'swap',
  fallback: ['Tahoma', 'Arial', 'sans-serif'],
});

export const latin = localFont({
  src: [
    { path: './ibm-plex-sans-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './ibm-plex-sans-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: './ibm-plex-sans-latin-600-normal.woff2', weight: '600', style: 'normal' },
    { path: './ibm-plex-sans-latin-700-normal.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-latin',
  display: 'swap',
  fallback: ['system-ui', 'Arial', 'sans-serif'],
});
