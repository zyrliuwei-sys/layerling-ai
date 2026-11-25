import { createFileRoute } from '@tanstack/react-router';

import { envConfigs } from '@/config';
import { CAD_PROMPT_LIMIT } from '@/lib/cad-api';
import { publicPageHead } from '@/lib/page-head';
import { m } from '@/paraglide/messages.js';
import { CadStudio } from '@/blocks/cad-studio';

export const Route = createFileRoute('/studio')({
  validateSearch: (search: Record<string, unknown>) => ({
    project:
      typeof search.project === 'string' && /^[\w-]{1,80}$/.test(search.project)
        ? search.project
        : undefined,
    browser: search.browser === true || search.browser === 'true' || undefined,
    prompt:
      typeof search.prompt === 'string'
        ? search.prompt.slice(0, CAD_PROMPT_LIMIT)
        : undefined,
  }),
  head: () =>
    publicPageHead({
      path: '/studio',
      title: `${m['cad.studio.metadata_title']()} | ${envConfigs.app_name}`,
      description: m['cad.studio.metadata_description'](),
    }),
  component: StudioPage,
});

function StudioPage() {
  return <CadStudio search={Route.useSearch()} />;
}
