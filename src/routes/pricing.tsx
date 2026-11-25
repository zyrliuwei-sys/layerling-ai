import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/pricing')({
  beforeLoad: () => {
    throw redirect({
      to: '/studio',
      search: { project: undefined, browser: undefined, prompt: undefined },
      statusCode: 308,
    });
  },
});
