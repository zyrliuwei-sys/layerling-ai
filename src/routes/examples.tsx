import { createFileRoute } from '@tanstack/react-router';

import { envConfigs } from '@/config';
import { publicPageHead } from '@/lib/page-head';
import { m } from '@/paraglide/messages.js';
import {
  CadExampleGallery,
  CadGuideLink,
  CadMarketing,
  CadSiteFooter,
  CadSiteHeader,
} from '@/blocks/cad-marketing';

export const Route = createFileRoute('/examples')({
  head: () =>
    publicPageHead({
      path: '/examples',
      title: `${m['cad.marketing.seo_examples_title']()} | ${envConfigs.app_name}`,
      description: m['cad.marketing.seo_examples_description'](),
    }),
  component: ExamplesPage,
});

function ExamplesPage() {
  return (
    <CadMarketing>
      <CadSiteHeader />
      <main className="cadm-library-main">
        <CadExampleGallery index />
        <CadGuideLink />
      </main>
      <CadSiteFooter />
    </CadMarketing>
  );
}
