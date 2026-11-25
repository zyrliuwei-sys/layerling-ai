import { createFileRoute, Outlet } from '@tanstack/react-router';
import { MDXProvider } from '@mdx-js/react';

import {
  CadMarketing,
  CadSiteFooter,
  CadSiteHeader,
} from '@/blocks/cad-marketing';
import { mdxComponents } from '@/components/mdx-components';

import '@/styles/cad-pages.css';

export const Route = createFileRoute('/(pages)')({
  component: PagesLayout,
});

function PagesLayout() {
  return (
    <CadMarketing>
      <CadSiteHeader />
      <main className="cadm-shell cad-article-main">
        <MDXProvider components={mdxComponents}>
          <Outlet />
        </MDXProvider>
      </main>
      <CadSiteFooter />
    </CadMarketing>
  );
}
