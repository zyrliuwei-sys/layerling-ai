import { createFileRoute } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';

import { Link } from '@/core/i18n/navigation';
import { envConfigs } from '@/config';
import { publicPageHead } from '@/lib/page-head';
import { m } from '@/paraglide/messages.js';
import {
  CadMarketing,
  CadSiteFooter,
  CadSiteHeader,
} from '@/blocks/cad-marketing';
import { CadOnlineEditor } from '@/blocks/cad-online-editor';

export const Route = createFileRoute('/editor')({
  head: () =>
    publicPageHead({
      path: '/editor',
      title: `${m['cad.editor.seo_title']()} | ${envConfigs.app_name}`,
      description: m['cad.editor.description'](),
      robots: 'noindex, follow',
    }),
  component: EditorPage,
});

function EditorPage() {
  return (
    <CadMarketing>
      <CadSiteHeader />
      <main className="cadm-shell cad-editor-main">
        <CadOnlineEditor />
        <section className="cad-editor-overview">
          <div>
            <h2>{m['cad.editor.overview_title']()}</h2>
            <p>{m['cad.editor.overview_body']()}</p>
          </div>
          <Link className="cadm-text-link" href="/layerling-cad">
            {m['cad.guide.open']()} <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </section>
      </main>
      <CadSiteFooter />
    </CadMarketing>
  );
}
