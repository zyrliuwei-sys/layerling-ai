import { envConfigs } from '@/config';
import { canonicalPagePath } from '@/lib/page-path';
import { serverSiteOrigin } from '@/lib/site-origin';

const defaultImage = '/imgs/cad/share-enclosure.jpg';

export function publicPageHead({
  path,
  title,
  description,
  type = 'website',
  image,
  imageAlt,
  robots,
}: {
  path: string;
  title: string;
  description: string;
  type?: 'website' | 'article';
  image?: string;
  imageAlt?: string;
  robots?: string;
}) {
  const origin = serverSiteOrigin();
  const url = new URL(canonicalPagePath(path), origin).href;
  let imageUrl = new URL(defaultImage, origin).href;
  if (image) {
    try {
      const candidate = new URL(image, origin);
      if (
        /^https?:$/.test(candidate.protocol) &&
        !candidate.username &&
        !candidate.password
      ) {
        imageUrl = candidate.href;
      }
    } catch {
      // A malformed article image still gets the site-wide share image.
    }
  }

  return {
    meta: [
      { title },
      { name: 'description', content: description },
      ...(robots ? [{ name: 'robots', content: robots }] : []),
      { property: 'og:type', content: type },
      { property: 'og:site_name', content: envConfigs.app_name },
      { property: 'og:url', content: url },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:image', content: imageUrl },
      ...(imageAlt ? [{ property: 'og:image:alt', content: imageAlt }] : []),
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
      { name: 'twitter:image', content: imageUrl },
      ...(imageAlt ? [{ name: 'twitter:image:alt', content: imageAlt }] : []),
    ],
    links: [
      { rel: 'canonical', href: url },
      { rel: 'alternate', hrefLang: 'en', href: url },
    ],
  };
}
