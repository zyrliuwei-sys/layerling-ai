import {
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from 'react';
import { getRouteApi } from '@tanstack/react-router';
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Box,
  Braces,
  ChevronDown,
  CircuitBoard,
  Menu,
  Ruler,
  SquarePen,
  Wrench,
} from 'lucide-react';

import { useSession } from '@/core/auth/client';
import { Link, usePathname, useRouter } from '@/core/i18n/navigation';
import { envConfigs } from '@/config';
import { CAD_LAUNCH_PROMPT, CAD_PROMPT_LIMIT } from '@/lib/cad-api';
import { openCookieSettings } from '@/lib/cookie-consent';
import { m } from '@/paraglide/messages.js';
import { useUserPermissions } from '@/hooks/use-user-permissions';

import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '@/styles/cad-marketing.css';

const rootRoute = getRouteApi('__root__');
const studio = '/studio';
const editor = '/editor';

function studioUrl(prompt: string) {
  return `${studio}?prompt=${encodeURIComponent(prompt)}`;
}

function navLinks() {
  return [
    { href: editor, label: m['cad.marketing.nav_editor']() },
    { href: studio, label: m['cad.marketing.nav_studio']() },
    { href: '/examples', label: m['cad.marketing.nav_examples']() },
    { href: '/layerling-cad', label: m['cad.guide.nav']() },
  ];
}

function modelExamples() {
  return [
    {
      image: '/imgs/cad/project-box.webp',
      alt: m['cad.marketing.example_enclosure_alt'](),
      title: m['cad.marketing.example_enclosure_title'](),
      category: m['cad.marketing.example_enclosure_category'](),
      href: studio,
      prompt: m['cad.marketing.example_box_prompt'](),
      action: m['cad.marketing.example_open'](),
      width: 1440,
      height: 820,
    },
    {
      image: '/imgs/cad/sensor.webp',
      alt: m['cad.marketing.example_sensor_alt'](),
      title: m['cad.marketing.example_sensor_title'](),
      category: m['cad.marketing.example_sensor_category'](),
      href: studio,
      prompt: m['cad.marketing.example_sensor_prompt'](),
      action: m['cad.marketing.example_open'](),
      width: 1080,
      height: 760,
    },
    {
      image: '/imgs/cad/mount.webp',
      alt: m['cad.marketing.example_mount_alt'](),
      title: m['cad.marketing.example_mount_title'](),
      category: m['cad.marketing.example_mount_category'](),
      href: editor,
      action: m['cad.marketing.example_manual'](),
      width: 1080,
      height: 760,
    },
  ];
}

function Brand() {
  return (
    <Link className="cadm-brand" href="/">
      <img
        className="cadm-brand-mark"
        src={envConfigs.app_logo}
        alt=""
        width={33}
        height={33}
      />
      <span>{envConfigs.app_name}</span>
    </Link>
  );
}

export function CadMarketing({ children }: { children: ReactNode }) {
  return <div className="cadm-marketing">{children}</div>;
}

export function CadSiteHeader() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { data: permissions } = useUserPermissions();
  const isAdmin = permissions?.isAdmin === true;
  const account = session?.user
    ? { href: '/projects', label: m['cad.marketing.nav_projects']() }
    : { href: '/sign-in', label: m['cad.marketing.nav_sign_in']() };
  const links = navLinks();
  const mobileNav = useRef<HTMLDetailsElement>(null);

  function closeMobileNav() {
    if (mobileNav.current) mobileNav.current.open = false;
  }
  const editorLaunch =
    pathname === '/' || pathname === editor ? '#layerling-editor' : editor;

  return (
    <header className="cadm-header">
      <div className="cadm-shell cadm-header-inner">
        <Brand />
        <nav className="cadm-nav" aria-label={m['cad.marketing.nav_primary']()}>
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              aria-current={pathname === href ? 'page' : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="cadm-nav-actions">
          <Link className="cadm-nav-signin" href={account.href}>
            {account.label}
          </Link>
          {isAdmin && (
            <Link className="cadm-nav-signin" href="/admin">
              {m['common.systems.admin']()}
            </Link>
          )}
          <Link
            className="cadm-button cadm-button--primary cadm-button--nav"
            href={editorLaunch}
          >
            {m['cad.marketing.nav_open_editor']()}
            {editorLaunch === editor ? (
              <ArrowRight aria-hidden="true" size={15} />
            ) : (
              <ArrowDown aria-hidden="true" size={15} />
            )}
          </Link>
        </div>
        <details
          className="cadm-mobile-nav"
          ref={mobileNav}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && event.currentTarget.open) {
              closeMobileNav();
              event.currentTarget.querySelector('summary')?.focus();
            }
          }}
        >
          <summary aria-label={m['cad.marketing.nav_mobile']()}>
            <Menu aria-hidden="true" size={21} />
          </summary>
          <nav
            className="cadm-mobile-links"
            aria-label={m['cad.marketing.nav_primary']()}
          >
            {links.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                onClick={closeMobileNav}
                aria-current={pathname === href ? 'page' : undefined}
              >
                {label}
              </Link>
            ))}
            <Link href={account.href} onClick={closeMobileNav}>
              {account.label}
            </Link>
            {isAdmin && (
              <Link href="/admin" onClick={closeMobileNav}>
                {m['common.systems.admin']()}
              </Link>
            )}
          </nav>
        </details>
      </div>
    </header>
  );
}

const maxLidGap = 42;

export function CadHomeHero({ children }: { children: ReactNode }) {
  return (
    <section className="cadm-shell cadm-home-hero">
      <div className="cadm-home-lead">
        <p className="cadm-eyebrow">{m['cad.marketing.home_eyebrow']()}</p>
        <h1>{m['cad.marketing.home_title']()}</h1>
        <p className="cadm-home-description">{m['cad.editor.home_intro']()}</p>
        <div className="cadm-home-actions">
          <Link
            className="cadm-button cadm-button--primary"
            href="#layerling-editor"
          >
            {m['cad.marketing.nav_open_editor']()}{' '}
            <ArrowDown size={17} aria-hidden="true" />
          </Link>
          <Link className="cadm-home-studio-link" href="#cad-ai-studio">
            {m['cad.marketing.nav_studio']()}{' '}
            <ArrowDown size={15} aria-hidden="true" />
          </Link>
        </div>
      </div>

      {children}
    </section>
  );
}

function CadEnclosurePreview() {
  const [gap, setGap] = useState(28);
  const clearance = m['cad.marketing.measure_mm']({ size: gap });

  return (
    <figure className="cadm-assembly" aria-labelledby="cadm-assembly-title">
      <div
        className="cadm-assembly-board"
        style={{ '--lid-gap': gap } as CSSProperties}
      >
        <div className="cadm-assembly-heading">
          <strong id="cadm-assembly-title">
            {m['cad.marketing.hero_render_name']()}
          </strong>
          <span>{m['cad.marketing.assembly_dimensions']()}</span>
        </div>
        <div className="cadm-assembly-art" aria-hidden="true">
          <div className="cadm-assembly-shadow" />
          <img
            className="cadm-assembly-body"
            src="/imgs/cad/studio-enclosure-body.webp"
            alt=""
            width={1080}
            height={840}
            loading="lazy"
          />
          <img
            className="cadm-assembly-lid"
            src="/imgs/cad/studio-enclosure-lid.webp"
            alt=""
            width={1080}
            height={840}
            loading="lazy"
          />
        </div>
        <div className="cadm-assembly-orientation" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <Link
          className="cadm-assembly-edit"
          href={studio}
          search={{ prompt: m['cad.marketing.example_enclosure_prompt']() }}
        >
          {m['cad.marketing.assembly_edit']()}{' '}
          <ArrowUpRight aria-hidden="true" size={16} />
        </Link>
      </div>
      <figcaption className="cadm-assembly-controls">
        <div className="cadm-assembly-readout">
          <label htmlFor="cadm-lid-gap">
            {m['cad.marketing.assembly_gap']()}
          </label>
          <output htmlFor="cadm-lid-gap" aria-hidden="true">
            {clearance}
          </output>
        </div>
        <div className="cadm-assembly-slider">
          <button
            type="button"
            onClick={() => setGap(0)}
            aria-pressed={gap === 0}
          >
            {m['cad.marketing.hero_assembled']()}
          </button>
          <input
            id="cadm-lid-gap"
            type="range"
            min={0}
            max={maxLidGap}
            value={gap}
            aria-valuetext={clearance}
            onChange={(event) => setGap(event.currentTarget.valueAsNumber)}
            style={
              {
                '--lid-progress': `${(gap / maxLidGap) * 100}%`,
              } as CSSProperties
            }
          />
          <button
            type="button"
            onClick={() => setGap(maxLidGap)}
            aria-pressed={gap === maxLidGap}
          >
            {m['cad.marketing.hero_exploded']()}
          </button>
        </div>
      </figcaption>
    </figure>
  );
}

export function CadStudioIntro() {
  const [prompt, setPrompt] = useState('');
  const router = useRouter();
  const suggestions = [
    [
      m['cad.marketing.prompt_enclosure'](),
      m['cad.marketing.example_enclosure_prompt'](),
    ],
    [
      m['cad.marketing.prompt_sensor'](),
      m['cad.marketing.example_sensor_prompt'](),
    ],
    [
      m['cad.marketing.prompt_rounded'](),
      m['cad.marketing.prompt_rounded_value'](),
    ],
  ];

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const description = prompt.trim();
    if (!description) {
      router.push(studio);
      return;
    }
    try {
      sessionStorage.setItem(CAD_LAUNCH_PROMPT, description);
    } catch {
      router.push(studioUrl(description));
      return;
    }
    router.push(studio);
  }

  return (
    <section
      className="cadm-shell cadm-hero"
      id="cad-ai-studio"
      aria-labelledby="cad-ai-studio-title"
    >
      <div className="cadm-hero-content">
        <p className="cadm-eyebrow">{m['cad.marketing.nav_studio']()}</p>
        <h2 id="cad-ai-studio-title">
          {m['cad.marketing.studio_intro_title']()}
        </h2>
        <p className="cadm-hero-description">
          {m['cad.marketing.hero_description']()}
        </p>
        <div className="cadm-brief">
          <form
            className="cadm-prompt"
            action={studio}
            method="get"
            onSubmit={submit}
          >
            <label className="cadm-prompt-label" htmlFor="cadm-hero-prompt">
              <SquarePen aria-hidden="true" size={16} />
              {m['cad.marketing.prompt_label']()}
            </label>
            <textarea
              id="cadm-hero-prompt"
              name="prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={3}
              maxLength={CAD_PROMPT_LIMIT}
              placeholder={m['cad.marketing.prompt_placeholder']()}
            />
            <div className="cadm-prompt-actions">
              <button
                type="submit"
                className="cadm-button cadm-button--primary"
              >
                {m['cad.marketing.prompt_submit']()}
                <ArrowUpRight aria-hidden="true" size={17} />
              </button>
            </div>
          </form>
          <div
            className="cadm-suggestions"
            role="group"
            aria-label={m['cad.marketing.prompt_suggestions']()}
          >
            <span>{m['cad.marketing.prompt_suggestions']()}</span>
            {suggestions.map(([label, value]) => (
              <button
                key={label}
                type="button"
                onClick={() => setPrompt(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <CadEnclosurePreview />
    </section>
  );
}

export function CadExampleGallery({ index = false }: { index?: boolean }) {
  return (
    <section
      className={
        index ? 'cadm-shell cadm-library' : 'cadm-shell cadm-example-section'
      }
      aria-label={index ? undefined : m['cad.marketing.examples_title']()}
    >
      {index ? (
        <div className="cadm-library-heading">
          <h1>{m['cad.marketing.examples_page_title']()}</h1>
          <p>{m['cad.marketing.examples_page_intro']()}</p>
        </div>
      ) : (
        <div className="cadm-section-heading cadm-section-heading--with-link">
          <div>
            <h2>{m['cad.marketing.examples_title']()}</h2>
            <p>{m['cad.marketing.examples_subtitle']()}</p>
          </div>
          <Link className="cadm-text-link" href="/examples">
            {m['cad.marketing.examples_link']()}{' '}
            <ArrowRight aria-hidden="true" size={17} />
          </Link>
        </div>
      )}
      <div className="cadm-example-grid">
        {modelExamples().map(
          ({
            image,
            alt,
            title,
            category,
            href,
            prompt,
            action,
            width,
            height,
          }) => (
            <Link
              className="cadm-example"
              href={href}
              search={prompt ? { prompt } : undefined}
              key={image}
            >
              <div className="cadm-example-art">
                <img
                  src={image}
                  alt={alt}
                  width={width}
                  height={height}
                  loading="lazy"
                />
              </div>
              <div className="cadm-example-caption">
                <div>
                  <h3>{title}</h3>
                  <p>{category}</p>
                </div>
                <span className="cadm-example-action">
                  {action}
                  <ArrowUpRight aria-hidden="true" size={18} />
                </span>
              </div>
            </Link>
          )
        )}
      </div>
    </section>
  );
}

export function CadWorkflow() {
  const steps = [
    {
      icon: Braces,
      title: m['cad.marketing.workflow_describe_title'](),
      body: m['cad.marketing.workflow_describe_body'](),
    },
    {
      icon: Ruler,
      title: m['cad.marketing.workflow_refine_title'](),
      body: m['cad.marketing.workflow_refine_body'](),
    },
    {
      icon: ArrowDownToLine,
      title: m['cad.marketing.workflow_export_title'](),
      body: m['cad.marketing.workflow_export_body'](),
    },
  ];

  return (
    <section className="cadm-workflow">
      <div className="cadm-shell cadm-workflow-inner">
        <div className="cadm-section-heading">
          <h2>{m['cad.marketing.workflow_title']()}</h2>
        </div>
        <ol>
          {steps.map(({ icon: Icon, title, body }) => (
            <li key={title}>
              <span className="cadm-step-icon">
                <Icon aria-hidden="true" size={22} strokeWidth={1.7} />
              </span>
              <div>
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function CadTools() {
  return (
    <section
      className="cadm-shell cadm-tools"
      aria-labelledby="cad-tools-title"
    >
      <div className="cadm-section-heading">
        <h2 id="cad-tools-title">{m['cad.marketing.tools_title']()}</h2>
        <p>{m['cad.marketing.tools_intro']()}</p>
      </div>
      <div className="cadm-tools-grid">
        <article>
          <Braces className="cadm-tool-icon" aria-hidden="true" size={24} />
          <h3>{m['cad.marketing.tools_studio_title']()}</h3>
          <p>{m['cad.marketing.tools_studio_body']()}</p>
          <p>{m['cad.marketing.tools_studio_details']()}</p>
          <Link className="cadm-text-link" href={studio}>
            {m['cad.marketing.nav_open']()}
            <ArrowRight aria-hidden="true" size={17} />
          </Link>
        </article>
        <article>
          <Wrench className="cadm-tool-icon" aria-hidden="true" size={24} />
          <h3>{m['cad.marketing.tools_editor_title']()}</h3>
          <p>{m['cad.marketing.tools_editor_body']()}</p>
          <p>{m['cad.marketing.tools_editor_details']()}</p>
          <Link className="cadm-text-link" href={editor}>
            {m['cad.marketing.editor_link']()}
            <ArrowRight aria-hidden="true" size={17} />
          </Link>
        </article>
      </div>
    </section>
  );
}

export function CadUses() {
  const uses = [
    {
      icon: CircuitBoard,
      title: m['cad.marketing.uses_enclosure_title'](),
      body: m['cad.marketing.uses_enclosure_body'](),
    },
    {
      icon: Box,
      title: m['cad.marketing.uses_organizer_title'](),
      body: m['cad.marketing.uses_organizer_body'](),
    },
    {
      icon: Wrench,
      title: m['cad.marketing.uses_bracket_title'](),
      body: m['cad.marketing.uses_bracket_body'](),
    },
  ];

  return (
    <section className="cadm-shell cadm-uses">
      <div className="cadm-section-heading">
        <h2>{m['cad.marketing.uses_title']()}</h2>
      </div>
      <dl>
        {uses.map(({ icon: Icon, title, body }) => (
          <div key={title}>
            <dt>
              <Icon aria-hidden="true" size={20} strokeWidth={1.7} />
              {title}
            </dt>
            <dd>{body}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function CadPrintPrep() {
  const checks = [
    {
      image: '/imgs/cad/fit-measurement.webp',
      alt: m['cad.marketing.print_measure_alt'](),
      title: m['cad.marketing.print_measure_title'](),
      body: m['cad.marketing.print_measure_body'](),
    },
    {
      image: '/imgs/cad/layer-preview.webp',
      alt: m['cad.marketing.print_slice_alt'](),
      title: m['cad.marketing.print_slice_title'](),
      body: m['cad.marketing.print_slice_body'](),
    },
    {
      image: '/imgs/cad/port-fit-check.webp',
      alt: m['cad.marketing.print_fit_alt'](),
      title: m['cad.marketing.print_fit_title'](),
      body: m['cad.marketing.print_fit_body'](),
    },
  ];

  return (
    <section className="cadm-print" aria-labelledby="cad-print-title">
      <div className="cadm-shell">
        <div className="cadm-section-heading cadm-section-heading--with-link">
          <div>
            <h2 id="cad-print-title">{m['cad.marketing.print_title']()}</h2>
            <p>{m['cad.marketing.print_intro']()}</p>
          </div>
          <Link href="/layerling-cad" className="cadm-text-link">
            {m['cad.guide.open']()} <ArrowRight aria-hidden="true" size={17} />
          </Link>
        </div>
        <ul className="cadm-print-checks">
          {checks.map(({ image, alt, title, body }) => (
            <li key={image}>
              <img
                src={image}
                alt={alt}
                width={960}
                height={630}
                loading="lazy"
              />
              <h3>{title}</h3>
              <p>{body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function CadGuideLink() {
  return (
    <section className="cadm-shell cadm-guide-link">
      <div className="cadm-section-heading">
        <h2>{m['cad.guide.home_heading']()}</h2>
        <p>{m['cad.guide.home_intro']()}</p>
      </div>
      <Link href="/layerling-cad" className="cadm-button cadm-button--ink">
        {m['cad.guide.open']()} <ArrowRight aria-hidden="true" size={18} />
      </Link>
    </section>
  );
}

export function CadFaq() {
  const entries = [
    [m['cad.marketing.faq_free_q'](), m['cad.marketing.faq_free_a']()],
    [m['cad.marketing.faq_create_q'](), m['cad.marketing.faq_create_a']()],
    [m['cad.marketing.faq_edit_q'](), m['cad.marketing.faq_edit_a']()],
    [m['cad.marketing.faq_formats_q'](), m['cad.marketing.faq_formats_a']()],
    [m['cad.marketing.faq_install_q'](), m['cad.marketing.faq_install_a']()],
    [m['cad.marketing.faq_account_q'](), m['cad.marketing.faq_account_a']()],
  ];

  return (
    <section className="cadm-shell cadm-faq">
      <div className="cadm-section-heading">
        <h2>{m['cad.marketing.faq_title']()}</h2>
      </div>
      <div className="cadm-questions">
        {entries.map(([question, answer]) => (
          <details key={question}>
            <summary>
              {question}
              <ChevronDown aria-hidden="true" size={19} />
            </summary>
            <p>{answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export function CadSiteFooter() {
  const cookieConsentEnabled =
    !!rootRoute.useLoaderData()?.cookieConsentEnabled;
  const supportEmail = m['common.support.email']();

  return (
    <footer className="cadm-footer">
      <div className="cadm-shell cadm-footer-inner">
        <div>
          <Brand />
          <p>{m['cad.marketing.footer_description']()}</p>
        </div>
        <div className="cadm-footer-group">
          <h2>{m['cad.marketing.footer_product']()}</h2>
          {navLinks().map(({ href, label }) => (
            <Link key={href} href={href}>
              {label}
            </Link>
          ))}
          <Link href="/projects">{m['cad.marketing.nav_projects']()}</Link>
        </div>
        <div className="cadm-footer-group">
          <h2>{m['cad.marketing.footer_support']()}</h2>
          <Link href={`mailto:${supportEmail}`}>{supportEmail}</Link>
          <Link href="https://github.com/henmedia/layerling">
            {m['cad.marketing.footer_source']()}
          </Link>
          <Link href="/privacy-policy">
            {m['cad.marketing.footer_privacy']()}
          </Link>
          <Link href="/terms-of-service">
            {m['cad.marketing.footer_terms']()}
          </Link>
          {cookieConsentEnabled && (
            <button type="button" onClick={openCookieSettings}>
              {m['cad.marketing.footer_cookie']()}
            </button>
          )}
        </div>
      </div>
    </footer>
  );
}
