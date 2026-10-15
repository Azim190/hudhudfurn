import type { Media } from '@/lib/catalog-types';

/**
 * <picture> with the API's pre-generated AVIF/WebP renditions. We do not use next/image because
 * images are already resized and CDN-cached; width/height reserve space to avoid layout shift.
 */
export function ResponsiveImage({
  media,
  alt,
  sizes,
  className,
  priority = false,
}: {
  media: Media;
  alt: string;
  sizes: string;
  className?: string;
  priority?: boolean;
}) {
  const set = (format: string) =>
    media.renditions
      .filter((r) => r.format === format)
      .sort((a, b) => a.width - b.width)
      .map((r) => `${r.url} ${r.width}w`)
      .join(', ');
  const avif = set('avif');
  const webp = set('webp');
  return (
    <picture>
      {avif && <source type="image/avif" srcSet={avif} sizes={sizes} />}
      {webp && <source type="image/webp" srcSet={webp} sizes={sizes} />}
      {/* eslint-disable-next-line @next/next/no-img-element -- renditions are pre-generated (see ADR-0003) */}
      <img
        src={media.url}
        alt={alt}
        width={media.width ?? 1200}
        height={media.height ?? 1500}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        fetchPriority={priority ? 'high' : undefined}
        className={className}
      />
    </picture>
  );
}
