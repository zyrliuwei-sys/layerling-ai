import { createFileRoute } from '@tanstack/react-router';

import { m } from '@/paraglide/messages.js';
import { CadProjects } from '@/blocks/cad-studio-projects';

export const Route = createFileRoute('/projects')({
  head: () => ({
    meta: [
      { title: m['cad.projects.metadata_title']() },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: CadProjects,
});
