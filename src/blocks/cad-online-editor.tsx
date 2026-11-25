import { useEffect, useRef, useState } from 'react';
import { useLocation } from '@tanstack/react-router';
import {
  ArrowRight,
  ArrowUpRight,
  Download,
  Maximize,
  Minimize,
} from 'lucide-react';

import { Link } from '@/core/i18n/navigation';
import { envConfigs } from '@/config';
import { layerlingDownloadUrl, layerlingSourceUrl } from '@/config/cad-editor';
import { m } from '@/paraglide/messages.js';

import '@/styles/cad-editor.css';

const upstream = 'https://layerling.com/';

function editorUrl() {
  try {
    const url = new URL(envConfigs.layerling_editor_url || upstream);
    const isLoopback = ['localhost', '127.0.0.1'].includes(url.hostname);
    if (
      url.username ||
      url.password ||
      url.origin === new URL(envConfigs.app_url).origin ||
      (url.protocol !== 'https:' && !(isLoopback && url.protocol === 'http:'))
    ) {
      return `${upstream}?editor=1`;
    }
    url.searchParams.set('editor', '1');
    return url.href;
  } catch {
    return `${upstream}?editor=1`;
  }
}

export function CadOnlineEditor({
  home = false,
  autoLoad = false,
}: {
  home?: boolean;
  autoLoad?: boolean;
}) {
  const url = editorUrl();
  const stageRef = useRef<HTMLDivElement>(null);
  const hash = useLocation({ select: (location) => location.hash });
  const [active, setActive] = useState(!home || autoLoad);
  const [loaded, setLoaded] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const fullView = fullscreen || expanded;

  useEffect(() => {
    function syncFullscreen() {
      setFullscreen(stageRef.current?.matches(':fullscreen') ?? false);
    }

    function closeExpandedView(event: KeyboardEvent) {
      if (event.key === 'Escape') setExpanded(false);
    }

    document.addEventListener('fullscreenchange', syncFullscreen);
    document.addEventListener('keydown', closeExpandedView);
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreen);
      document.removeEventListener('keydown', closeExpandedView);
    };
  }, []);

  useEffect(() => {
    if (home && hash === 'layerling-editor') setActive(true);
  }, [hash, home]);

  useEffect(() => {
    if (home && !autoLoad && active)
      stageRef.current?.focus({ preventScroll: true });
  }, [active, autoLoad, home]);

  async function toggleFullscreen() {
    const stage = stageRef.current;
    if (!stage) return;
    if (fullscreen) {
      await document.exitFullscreen().catch(() => {});
      return;
    }
    if (expanded) {
      setExpanded(false);
      return;
    }
    if (document.fullscreenEnabled && stage.requestFullscreen) {
      try {
        await stage.requestFullscreen();
        return;
      } catch {
        // Some browsers or embedding pages deny native fullscreen.
      }
    }
    if (stage.isConnected) setExpanded(true);
  }

  return (
    <>
      <div
        id="layerling-editor"
        tabIndex={-1}
        ref={stageRef}
        data-active={active}
        className={
          expanded
            ? 'cad-editor-stage cad-editor-stage--expanded'
            : 'cad-editor-stage'
        }
      >
        <div className="cad-editor-heading">
          <div className="cad-editor-intro">
            {home ? (
              <h2 id="cadm-editor-title">{m['cad.editor.title']()}</h2>
            ) : (
              <>
                <h1>{m['cad.editor.title']()}</h1>
                <p>{m['cad.editor.description']()}</p>
              </>
            )}
          </div>
          <div className="cad-editor-actions">
            {!home && (
              <Link
                href={layerlingDownloadUrl}
                download
                className="cadm-button cad-editor-install"
              >
                <Download size={16} aria-hidden="true" />
                {m['cad.editor.download_zip']()}
              </Link>
            )}
            <Link
              href={url}
              target="_blank"
              rel="noreferrer"
              className="cadm-button cadm-button--ink cad-editor-open-tab"
              aria-label={m['cad.editor.open_tab']()}
              title={m['cad.editor.open_tab']()}
            >
              <span>{m['cad.editor.open_tab']()}</span>
              <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
            {active ? (
              <button
                type="button"
                className="cadm-button cadm-button--primary"
                onClick={toggleFullscreen}
              >
                {fullView ? (
                  <Minimize size={16} aria-hidden="true" />
                ) : (
                  <Maximize size={16} aria-hidden="true" />
                )}
                {fullView
                  ? m['cad.editor.exit_fullscreen']()
                  : m['cad.editor.fullscreen']()}
              </button>
            ) : (
              <button
                type="button"
                className="cadm-button cadm-button--primary"
                onClick={() => setActive(true)}
              >
                {m['cad.editor.load']()}
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
        {active && (
          <div className="cad-editor-viewport">
            {!loaded && home && !autoLoad && (
              <div className="cad-editor-loading" role="status">
                <strong>{m['cad.editor.loading']()}</strong>
                <span>{m['cad.editor.loading_help']()}</span>
              </div>
            )}
            <iframe
              className="cad-editor-frame"
              src={url}
              title={m['cad.editor.frame_title']()}
              onLoad={() => setLoaded(true)}
              loading="eager"
              sandbox="allow-scripts allow-same-origin allow-downloads allow-forms allow-popups"
              allow="fullscreen"
              referrerPolicy="strict-origin"
            />
          </div>
        )}
      </div>
      <div className="cad-editor-footer">
        <span>{m['cad.editor.storage']()}</span>
        <div className="cad-editor-resources">
          {home && (
            <Link href={layerlingDownloadUrl} download>
              {m['cad.editor.download_zip']()}
              <Download size={14} aria-hidden="true" />
            </Link>
          )}
          <Link href={layerlingSourceUrl} target="_blank" rel="noreferrer">
            {m['cad.editor.source']()}
            <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </>
  );
}
