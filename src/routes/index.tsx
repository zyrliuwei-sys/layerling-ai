import { createFileRoute } from '@tanstack/react-router';

import { envConfigs } from '@/config';
import { publicPageHead } from '@/lib/page-head';
import { m } from '@/paraglide/messages.js';
import {
  CadExampleGallery,
  CadFaq,
  CadHomeHero,
  CadMarketing,
  CadPrintPrep,
  CadSiteFooter,
  CadSiteHeader,
  CadStudioIntro,
  CadTools,
  CadUses,
  CadWorkflow,
} from '@/blocks/cad-marketing';
import { CadOnlineEditor } from '@/blocks/cad-online-editor';

export const Route = createFileRoute('/')({
  head: () => {
    const head = publicPageHead({
      path: '/',
      title: m['cad.marketing.seo_home_title'](),
      description: m['cad.marketing.seo_home_description'](),
      imageAlt: m['cad.marketing.hero_assembled_alt'](),
    });
    const website = {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: envConfigs.app_name,
      url: head.links[0].href,
      inLanguage: 'en',
    };
    return {
      ...head,
      scripts: [
        {
          type: 'application/ld+json',
          children: JSON.stringify(website).replaceAll('<', '\\u003c'),
        },
      ],
    };
  },
  component: HomePage,
});

function HomePage() {
  return (
    <CadMarketing>
      <a className="cadm-skip-link" href="#cad-main">
        {m['cad.marketing.skip_main']()}
      </a>
      <CadSiteHeader />
      <main id="cad-main" tabIndex={-1} className="cadm-home">
        <CadHomeHero>
          <section
            className="cadm-online-editor"
            aria-labelledby="cadm-editor-title"
          >
            <CadOnlineEditor home />
          </section>
        </CadHomeHero>
        <CadStudioIntro />
        <div className="cadm-example-band">
          <CadExampleGallery />
        </div>
        <CadWorkflow />
        <CadTools />
        <CadUses />
        <CadPrintPrep />
        <CadFaq />
      </main>
      <CadSiteFooter />
    </CadMarketing>
  );
}
