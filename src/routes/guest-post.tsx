import { createFileRoute } from '@tanstack/react-router';

import { publicPageHead } from '@/lib/page-head';
import { m } from '@/paraglide/messages.js';
import { getLocale } from '@/paraglide/runtime.js';
import { Footer } from '@/blocks/footer';
import { GuestPostLanding } from '@/blocks/guest-post';
import { Header } from '@/blocks/header';
import { getGuestPostsOpenFn } from '@/content/posts/server';

export const Route = createFileRoute('/guest-post')({
  loader: async () => {
    const locale = getLocale();
    return {
      enabled: await getGuestPostsOpenFn(),
      title: m['guest_posts.landing.title']({}, { locale }),
      description: m['guest_posts.landing.description']({}, { locale }),
    };
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {};
    const { title, description, enabled } = loaderData;
    const head = publicPageHead({ path: '/guest-post', title, description });
    if (!enabled) head.meta.push({ name: 'robots', content: 'noindex' });
    return head;
  },
  component: GuestPostPage,
});

function GuestPostPage() {
  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <GuestPostLanding />
      </main>
      <Footer />
    </div>
  );
}
