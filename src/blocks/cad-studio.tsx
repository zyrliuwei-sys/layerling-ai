import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownToLine,
  ArrowRight,
  Box,
  Check,
  ChevronDown,
  CircleHelp,
  FolderOpen,
  History,
  Layers3,
  LoaderCircle,
  MoveUpRight,
  Redo2,
  RotateCcw,
  Send,
  SlidersHorizontal,
  Sparkles,
  Undo2,
} from 'lucide-react';

import { useSession } from '@/core/auth/client';
import { Link } from '@/core/i18n/navigation';
import { ApiError, apiGet, apiPost } from '@/lib/api-client';
import {
  CAD_HISTORY_LIMIT,
  CAD_LAUNCH_PROMPT,
  CAD_PROJECT_NAME_LIMIT,
  CAD_PROMPT_LIMIT,
  type CadInterpretation,
  type CadProject,
  type CadQuota,
} from '@/lib/cad-api';
import {
  buildEnclosure,
  defaultEnclosure,
  enclosureSchema,
  exportEnclosure,
  interpretEnclosurePrompt,
  type Enclosure,
} from '@/lib/cad-enclosure';
import { m } from '@/paraglide/messages.js';
import type { CadCameraView } from '@/components/cad-viewport';

import { CadWorkspaceHeader } from './cad-studio-header';
import {
  getBrowserProjects,
  saveBrowserProject,
} from './cad-studio-project-store';

const Viewport = lazy(() =>
  import('@/components/cad-viewport').then((module) => ({
    default: module.CadViewport,
  }))
);

type Part = 'body' | 'lid';
type Format = 'stl' | '3mf';
type Mesh = Awaited<ReturnType<typeof buildEnclosure>>;
type HistoryState = Pick<CadProject, 'versions' | 'index'>;
type Search = { project?: string; browser?: boolean; prompt?: string };
type Result = Omit<CadInterpretation, 'remaining'> & { remaining?: number };
type Turn = { prompt: string; reply: string; error?: boolean };
type Display = { params: Enclosure; mesh?: Mesh; error?: string };
type Notice = { text: string; tone: 'success' | 'error' };

const partLabel = {
  body: m['cad.studio.body'],
  lid: m['cad.studio.lid'],
};
const viewLabel = {
  iso: m['cad.studio.isometric'],
  top: m['cad.studio.top'],
  front: m['cad.studio.front'],
};
const numberFields = [
  ['width', m['cad.field.width']],
  ['depth', m['cad.field.depth']],
  ['height', m['cad.field.height']],
  ['wallThickness', m['cad.field.wall']],
  ['cornerRadius', m['cad.field.radius']],
  ['screwHoles', m['cad.field.holes']],
  ['holeDiameter', m['cad.field.diameter']],
  ['mountingInset', m['cad.field.inset']],
  ['portWidth', m['cad.field.port_width']],
  ['portHeight', m['cad.field.port_height']],
] as const;
const portOptions = {
  none: m['cad.field.port_none'],
  front: m['cad.field.port_front'],
  back: m['cad.field.port_back'],
  left: m['cad.field.port_left'],
  right: m['cad.field.port_right'],
};
const examples = [
  m['cad.studio.example_wide'],
  m['cad.studio.example_holes'],
  m['cad.studio.example_port'],
];
type NumericField = (typeof numberFields)[number][0];
type ParameterDraft = Record<NumericField, string> &
  Pick<Enclosure, 'lid' | 'port'>;
const emptyParts: Mesh['parts'] = [];

function parameterDraft(params: Enclosure): ParameterDraft {
  const values = Object.fromEntries(
    numberFields.map(([key]) => [key, String(params[key])])
  ) as Record<NumericField, string>;
  return { ...values, lid: params.lid, port: params.port };
}

const cadErrors: Record<string, () => string> = {
  prompt: m['cad.api.invalid_request'],
  unsupported: m['cad.api.unsupported'],
  walls: m['cad.api.walls'],
  corners: m['cad.api.corners'],
  holes: m['cad.api.holes'],
  port: m['cad.api.port'],
  dimensions: m['cad.api.dimensions'],
  geometryTimeout: m['cad.studio.geometry_timeout'],
  nonManifold: m['cad.studio.export_manifold'],
  projectConflict: m['cad.projects.conflict'],
};

function failed(error: unknown, fallback: string) {
  if (error instanceof ApiError && error.message) return error.message;
  if (error instanceof Error) return cadErrors[error.message]?.() ?? fallback;
  return fallback;
}

function studioCallback(search: Search = {}) {
  const query = new URLSearchParams();
  if (search.project) query.set('project', search.project);
  if (search.browser) query.set('browser', 'true');
  if (search.prompt) query.set('prompt', search.prompt);
  return query.size ? `/studio?${query}` : '/studio';
}

export function CadStudio({ search }: { search: Search }) {
  const { data: session, isPending: sessionPending } = useSession();
  const userId = session?.user?.id;
  const { project, browser, prompt } = search;
  const saved = useQuery({
    queryKey: ['cad-project', browser ? 'browser' : userId, project],
    queryFn: async () => {
      if (browser) {
        const entry = getBrowserProjects().find((item) => item.id === project);
        if (!entry) throw new Error(m['cad.projects.missing']());
        return entry;
      }
      return apiGet<CadProject>(
        `/api/cad/projects/${encodeURIComponent(project!)}`
      );
    },
    enabled: Boolean(project && (browser || userId)),
    refetchOnWindowFocus: false,
    retry: false,
  });

  if (project && !browser && !sessionPending && !userId) {
    return (
      <StudioGate heading={m['cad.projects.sign_in_title']()}>
        <Link
          className="cad-button cad-button-primary"
          href="/sign-in"
          search={{ callbackUrl: studioCallback(search) }}
        >
          {m['cad.studio.sign_in']()} <ArrowRight aria-hidden="true" />
        </Link>
      </StudioGate>
    );
  }
  if (project && !saved.data) {
    return (
      <StudioGate
        heading={
          saved.isError
            ? m['cad.projects.missing']()
            : m['cad.projects.loading']()
        }
      >
        {saved.isError && (
          <Link className="cad-button cad-button-secondary" href="/projects">
            {m['cad.projects.back']()}
          </Link>
        )}
      </StudioGate>
    );
  }

  return (
    <StudioEditor
      key={`${project ?? 'new'}:${browser ? 'browser' : (userId ?? 'guest')}:${prompt ?? ''}`}
      project={saved.data}
      browser={browser}
      initialPrompt={prompt}
      userId={userId}
      sessionPending={sessionPending}
    />
  );
}

function StudioGate({
  heading,
  children,
}: {
  heading: string;
  children?: ReactNode;
}) {
  return (
    <div className="cad-workspace">
      <CadWorkspaceHeader />
      <main className="cad-studio-gate">
        <Box aria-hidden="true" />
        <h1>{heading}</h1>
        {children}
      </main>
    </div>
  );
}

function StudioEditor({
  project,
  browser,
  initialPrompt,
  userId,
  sessionPending,
}: {
  project?: CadProject;
  browser?: boolean;
  initialPrompt?: string;
  userId?: string;
  sessionPending: boolean;
}) {
  const initialHistory = project
    ? { versions: project.versions, index: project.index }
    : { versions: [defaultEnclosure], index: 0 };
  const [history, setHistory] = useState<HistoryState>(initialHistory);
  const committed = history.versions[history.index];
  const [projectId, setProjectId] = useState(project?.id);
  const [revision, setRevision] = useState(project?.revision);
  const [name, setName] = useState(
    project?.name ?? m['cad.studio.default_model']()
  );
  const [savedSignature, setSavedSignature] = useState(
    project
      ? JSON.stringify({
          name: project.name,
          versions: project.versions,
          index: project.index,
        })
      : ''
  );
  const [prompt, setPrompt] = useState(initialPrompt ?? '');
  const [staged, setStaged] = useState<Enclosure | null>(null);
  const [display, setDisplay] = useState<Display | null>(null);
  const [geometry, setGeometry] = useState<Display | null>(null);
  const [draft, setDraft] = useState(() => parameterDraft(committed));
  const [selected, setSelected] = useState<Part | null>(null);
  const [view, setView] = useState<{
    direction: CadCameraView;
    revision: number;
  }>({
    direction: 'iso',
    revision: 0,
  });
  const [turns, setTurns] = useState<Turn[]>([]);
  const [inspector, setInspector] = useState<'parameters' | 'history'>(
    'parameters'
  );
  const [format, setFormat] = useState<Format>('stl');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [fieldError, setFieldError] = useState('');
  const [remaining, setRemaining] = useState<number>();
  const auto = useRef(false);
  const endOfChat = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const target = staged ?? committed;
  const geomPending = display?.params !== target;
  const canApply = Boolean(
    staged && display?.params === staged && display?.mesh
  );
  const editsPending =
    JSON.stringify(draft) !== JSON.stringify(parameterDraft(target));
  const signature = JSON.stringify({ name: name.trim(), ...history });
  const isSaved = signature === savedSignature;

  useEffect(() => {
    let cancelled = false;
    buildEnclosure(target)
      .then((mesh) => {
        if (cancelled) return;
        const result = { params: target, mesh };
        setDisplay(result);
        setGeometry(result);
        if (!target.lid) setSelected((part) => (part === 'lid' ? null : part));
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setDisplay({
            params: target,
            error: failed(error, m['cad.studio.geometry_error']()),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [target]);

  useEffect(() => {
    endOfChat.current?.scrollIntoView?.({ block: 'nearest' });
  }, [turns.length]);

  const quota = useQuery({
    queryKey: ['cad-quota', userId],
    queryFn: () => apiGet<CadQuota>('/api/cad/interpret'),
    enabled: Boolean(userId),
    retry: false,
  });

  const interpretation = useMutation({
    mutationFn: async ({
      text,
      useAccount,
    }: {
      text: string;
      useAccount: boolean;
    }): Promise<Result> =>
      userId && useAccount
        ? apiPost<Result>('/api/cad/interpret', {
            prompt: text,
            current: committed,
            ...(selected ? { selected } : {}),
          })
        : {
            params: interpretEnclosurePrompt(
              text,
              committed,
              selected ?? undefined
            ),
            source: 'rules',
          },
    onSuccess(result, { text }) {
      setRemaining(result.remaining);
      setFieldError('');
      if (
        JSON.stringify(parameterDraft(result.params)) ===
        JSON.stringify(parameterDraft(committed))
      ) {
        setTurns((previous) => [
          ...previous,
          { prompt: text, reply: m['cad.studio.no_changes']() },
        ]);
      } else {
        setStaged(result.params);
        setDraft(parameterDraft(result.params));
        setTurns((previous) => [
          ...previous,
          {
            prompt: text,
            reply:
              result.source === 'ai'
                ? m['cad.studio.ai_proposal']()
                : m['cad.studio.rules_proposal'](),
          },
        ]);
      }
      setPrompt('');
    },
    onError(error, { text }) {
      setTurns((previous) => [
        ...previous,
        {
          prompt: text,
          reply: failed(error, m['cad.studio.prompt_error']()),
          error: true,
        },
      ]);
    },
  });

  useEffect(() => {
    if (auto.current || sessionPending) return;
    auto.current = true;
    let launchPrompt = '';
    if (!project) {
      try {
        launchPrompt =
          sessionStorage
            .getItem(CAD_LAUNCH_PROMPT)
            ?.trim()
            .slice(0, CAD_PROMPT_LIMIT) ?? '';
        sessionStorage.removeItem(CAD_LAUNCH_PROMPT);
      } catch {
        // A blocked browser store still allows a guided preview from a link.
      }
    }
    const text = launchPrompt || initialPrompt?.trim();
    if (text) {
      setPrompt(text);
      // Share links can preview locally, while a submitted prompt may use account quota.
      interpretation.mutate({ text, useAccount: Boolean(launchPrompt) });
    }
  }, [initialPrompt, interpretation, project, sessionPending]);

  function submitPrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = prompt.trim();
    if (
      text &&
      !staged &&
      !editsPending &&
      !interpretation.isPending &&
      !sessionPending
    ) {
      setNotice(null);
      interpretation.mutate({ text, useAccount: true });
    }
  }

  const moveHistory = useCallback(
    (index: number) => {
      const snapshot = history.versions[index];
      if (!snapshot) return;
      setHistory({ ...history, index });
      setDraft(parameterDraft(snapshot));
      setStaged(null);
      setNotice(null);
      setFieldError('');
    },
    [history]
  );

  const undoDisabled =
    history.index < 1 || interpretation.isPending || Boolean(staged);
  const redoDisabled =
    history.index >= history.versions.length - 1 ||
    interpretation.isPending ||
    Boolean(staged);
  useEffect(() => {
    function keyboard(event: KeyboardEvent) {
      if (
        !(event.metaKey || event.ctrlKey) ||
        event.key.toLowerCase() !== 'z' ||
        (event.target instanceof HTMLElement &&
          (event.target.isContentEditable ||
            ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)))
      )
        return;
      const disabled = event.shiftKey ? redoDisabled : undoDisabled;
      if (disabled) return;
      event.preventDefault();
      moveHistory(history.index + (event.shiftKey ? 1 : -1));
    }
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, [history.index, moveHistory, redoDisabled, undoDisabled]);

  function manualPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (interpretation.isPending) return;
    const values = Object.fromEntries(
      numberFields.map(([key]) => [
        key,
        draft[key].trim() ? Number(draft[key]) : NaN,
      ])
    );
    const result = enclosureSchema.safeParse({
      ...values,
      lid: draft.lid,
      port: draft.port,
    });
    if (!result.success) {
      const issue = result.error.issues[0];
      const label = numberFields.find(([key]) => key === issue.path[0])?.[1]();
      const message = cadErrors[issue.message]?.() ?? issue.message;
      setFieldError(label ? `${label} · ${message}` : message);
      return;
    }
    setFieldError('');
    if (
      JSON.stringify(parameterDraft(result.data)) ===
      JSON.stringify(parameterDraft(committed))
    ) {
      setStaged(null);
      return;
    }
    setStaged(result.data);
  }

  function accept() {
    if (!canApply || !staged) return;
    const versions = [
      ...history.versions.slice(0, history.index + 1),
      staged,
    ].slice(-CAD_HISTORY_LIMIT);
    setHistory({ versions, index: versions.length - 1 });
    setDraft(parameterDraft(staged));
    setStaged(null);
    setNotice({ text: m['cad.studio.applied'](), tone: 'success' });
  }

  function discard() {
    setStaged(null);
    setDraft(parameterDraft(committed));
    setFieldError('');
  }

  const save = useMutation({
    mutationFn: async (input: {
      signature: string;
      name: string;
      versions: Enclosure[];
      index: number;
    }) => {
      const { signature: _signature, ...payload } = input;
      if (browser || !userId)
        return saveBrowserProject(payload, projectId, revision);
      return apiPost<CadProject>('/api/cad/projects', {
        ...payload,
        ...(projectId ? { id: projectId, revision } : {}),
      });
    },
    onSuccess(result, input) {
      setProjectId(result.id);
      setRevision(result.revision);
      setSavedSignature(input.signature);
      setNotice({
        text:
          browser || !userId
            ? m['cad.studio.saved_browser']()
            : m['cad.studio.saved'](),
        tone: 'success',
      });
      void queryClient.invalidateQueries({ queryKey: ['cad-projects'] });
      queryClient.setQueryData(
        ['cad-project', browser || !userId ? 'browser' : userId, result.id],
        result
      );
    },
    onError(error) {
      setNotice({
        text: failed(error, m['cad.studio.save_error']()),
        tone: 'error',
      });
    },
  });

  const download = useMutation({
    mutationFn: async () => {
      if (display?.params !== committed || !display.mesh) {
        throw new Error(m['cad.studio.geometry_error']());
      }
      const file = await exportEnclosure(display.mesh, format);
      const filename = name
        .trim()
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/^-|-$/g, '');
      const url = URL.createObjectURL(file);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${filename || 'enclosure'}.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    },
    onError(error) {
      setNotice({
        text: failed(error, m['cad.studio.export_error']()),
        tone: 'error',
      });
    },
  });

  const viewportView = (direction: CadCameraView) =>
    setView((previous) => ({
      direction,
      revision: previous.revision + 1,
    }));
  const quotaRemaining =
    remaining ??
    (quota.data?.source === 'ai' ? quota.data.remaining : undefined);
  const geometryError = !geomPending ? display?.error : undefined;

  return (
    <div className="cad-workspace">
      <CadWorkspaceHeader>
        {userId ? (
          <Link
            className="cad-button cad-button-secondary cad-account-button"
            href="/settings"
          >
            {m['cad.studio.account']()}
          </Link>
        ) : (
          <Link
            className="cad-button cad-button-secondary cad-account-button"
            href="/sign-in"
            search={{
              callbackUrl: studioCallback({
                project: projectId,
                browser: Boolean(projectId),
                prompt,
              }),
            }}
          >
            {m['cad.studio.sign_in']()}
          </Link>
        )}
      </CadWorkspaceHeader>

      <div className="cad-studio-toolbar">
        <div className="cad-doc-title">
          <span className="cad-doc-icon">
            <Box aria-hidden="true" />
          </span>
          <div>
            <input
              aria-label={m['cad.studio.name']()}
              maxLength={CAD_PROJECT_NAME_LIMIT}
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
            <span>{m['cad.studio.enclosure_design']()}</span>
          </div>
        </div>
        <div className="cad-toolbar-history">
          <button
            type="button"
            className="cad-button cad-button-icon"
            aria-label={m['cad.studio.undo']()}
            title={m['cad.studio.undo']()}
            disabled={undoDisabled}
            onClick={() => moveHistory(history.index - 1)}
          >
            <Undo2 aria-hidden="true" />
          </button>
          <button
            type="button"
            className="cad-button cad-button-icon"
            aria-label={m['cad.studio.redo']()}
            title={m['cad.studio.redo']()}
            disabled={redoDisabled}
            onClick={() => moveHistory(history.index + 1)}
          >
            <Redo2 aria-hidden="true" />
          </button>
        </div>
        <div className="cad-toolbar-actions">
          <button
            type="button"
            className="cad-button cad-button-secondary"
            disabled={
              sessionPending ||
              save.isPending ||
              !name.trim() ||
              Boolean(staged) ||
              editsPending ||
              geomPending ||
              Boolean(geometryError) ||
              isSaved
            }
            onClick={() =>
              save.mutate({ signature, name: name.trim(), ...history })
            }
          >
            {isSaved ? (
              <Check aria-hidden="true" />
            ) : (
              <FolderOpen aria-hidden="true" />
            )}
            {isSaved ? m['cad.studio.saved_label']() : m['cad.studio.save']()}
          </button>
          <div className="cad-export-group">
            <label className="cad-export-format">
              <select
                aria-label={m['cad.studio.format']()}
                value={format}
                onChange={(event) => setFormat(event.target.value as Format)}
              >
                <option value="stl">STL</option>
                <option value="3mf">3MF</option>
              </select>
              <ChevronDown aria-hidden="true" />
            </label>
            <button
              type="button"
              className="cad-button cad-button-primary"
              disabled={
                download.isPending ||
                geomPending ||
                Boolean(staged) ||
                Boolean(geometryError)
              }
              onClick={() => download.mutate()}
            >
              <ArrowDownToLine aria-hidden="true" /> {m['cad.studio.export']()}
            </button>
          </div>
        </div>
      </div>

      {notice && (
        <div
          className="cad-workspace-notice"
          data-tone={notice.tone}
          role={notice.tone === 'error' ? 'alert' : 'status'}
        >
          {notice.text}
        </div>
      )}

      <main className="cad-studio-grid">
        <section
          className="cad-assistant"
          aria-labelledby="cad-assistant-title"
        >
          <header className="cad-panel-title">
            <span className="cad-panel-icon">
              <Sparkles aria-hidden="true" />
            </span>
            <div>
              <h1 id="cad-assistant-title">{m['cad.studio.assistant']()}</h1>
              <p>
                {quotaRemaining === undefined
                  ? m['cad.studio.local_prompt']()
                  : quotaRemaining === 0
                    ? m['cad.studio.ai_quota_used']()
                    : m['cad.studio.quota']({ count: quotaRemaining })}
              </p>
            </div>
          </header>

          <div className="cad-chat-scroll" aria-live="polite">
            <div className="cad-chat-intro">
              <h2>{m['cad.studio.first_prompt']()}</h2>
              <p>{m['cad.studio.first_prompt_body']()}</p>
              <div className="cad-prompt-ideas">
                {examples.map((example) => (
                  <button
                    key={example()}
                    type="button"
                    onClick={() => setPrompt(example())}
                  >
                    {example()} <MoveUpRight aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>
            {turns.map((turn, index) => (
              <div className="cad-chat-turn" key={index}>
                <p className="cad-chat-user">{turn.prompt}</p>
                <p
                  className="cad-chat-system"
                  data-error={turn.error || undefined}
                >
                  <Sparkles aria-hidden="true" /> <span>{turn.reply}</span>
                </p>
              </div>
            ))}
            {interpretation.isPending && (
              <p className="cad-chat-pending">
                <LoaderCircle aria-hidden="true" />{' '}
                {m['cad.studio.interpreting']()}
              </p>
            )}
            <div ref={endOfChat} />
          </div>

          <form className="cad-prompt-form" onSubmit={submitPrompt}>
            {selected && (
              <span className="cad-assistant-selection">
                <Box aria-hidden="true" /> {partLabel[selected]()}
              </span>
            )}
            <textarea
              aria-label={m['cad.studio.prompt_label']()}
              placeholder={m['cad.studio.prompt_placeholder']()}
              maxLength={CAD_PROMPT_LIMIT}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === 'Enter' &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <div>
              <span>{m['cad.studio.prompt_hint']()}</span>
              <button
                type="submit"
                className="cad-button cad-button-primary cad-button-icon"
                aria-label={m['cad.studio.send']()}
                title={m['cad.studio.send']()}
                disabled={
                  !prompt.trim() ||
                  Boolean(staged) ||
                  editsPending ||
                  interpretation.isPending ||
                  sessionPending
                }
              >
                <Send aria-hidden="true" />
              </button>
            </div>
          </form>
        </section>

        <section
          className="cad-canvas-panel"
          aria-label={m['cad.studio.viewport']()}
        >
          <div className="cad-canvas-top">
            <span className="cad-canvas-badge">
              <Box aria-hidden="true" /> {m['cad.studio.viewport']()}
            </span>
            <div
              className="cad-canvas-views"
              aria-label={m['cad.studio.camera']()}
            >
              {(Object.keys(viewLabel) as CadCameraView[]).map((direction) => (
                <button
                  key={direction}
                  type="button"
                  aria-pressed={view.direction === direction}
                  onClick={() => viewportView(direction)}
                >
                  {viewLabel[direction]()}
                </button>
              ))}
              <button
                type="button"
                className="cad-reset-view"
                onClick={() => viewportView('iso')}
                aria-label={m['cad.studio.reset_view']()}
                title={m['cad.studio.reset_view']()}
              >
                <RotateCcw aria-hidden="true" />
              </button>
            </div>
          </div>
          <Suspense fallback={<div className="cad-viewport-canvas" />}>
            <Viewport
              parts={geometry?.mesh?.parts ?? emptyParts}
              selected={selected}
              onSelect={setSelected}
              view={view}
              label={m['cad.studio.model_label']()}
              unsupported={m['cad.studio.webgl']()}
            />
          </Suspense>
          {(geomPending || geometryError) && (
            <div
              className="cad-canvas-state"
              role={geometryError ? 'alert' : 'status'}
            >
              {geomPending && <LoaderCircle aria-hidden="true" />}
              {geometryError ?? m['cad.studio.building']()}
            </div>
          )}
          <div className="cad-canvas-bottom">
            <span dir="ltr">
              {(geometry?.params ?? committed).width} ×{' '}
              {(geometry?.params ?? committed).depth} ×{' '}
              {(geometry?.params ?? committed).height} mm
            </span>
            <span>
              <CircleHelp aria-hidden="true" /> {m['cad.studio.controls']()}
            </span>
          </div>
          {staged && (
            <div className="cad-preview-bar" role="status">
              <span>
                <Sparkles aria-hidden="true" />{' '}
                {m['cad.studio.preview_ready']()}
              </span>
              <div>
                <button
                  type="button"
                  className="cad-button cad-button-secondary"
                  onClick={discard}
                >
                  {m['cad.studio.discard']()}
                </button>
                <button
                  type="button"
                  className="cad-button cad-button-primary"
                  disabled={!canApply || editsPending}
                  onClick={accept}
                >
                  <Check aria-hidden="true" /> {m['cad.studio.apply']()}
                </button>
              </div>
            </div>
          )}
        </section>

        <aside
          className="cad-inspector"
          aria-label={m['cad.studio.inspector']()}
        >
          <div className="cad-inspector-tabs">
            <button
              type="button"
              aria-pressed={inspector === 'parameters'}
              onClick={() => setInspector('parameters')}
            >
              <SlidersHorizontal aria-hidden="true" />{' '}
              {m['cad.studio.parameters']()}
            </button>
            <button
              type="button"
              aria-pressed={inspector === 'history'}
              onClick={() => setInspector('history')}
            >
              <History aria-hidden="true" /> {m['cad.studio.history']()}
            </button>
          </div>
          {inspector === 'parameters' ? (
            <div className="cad-inspector-scroll">
              <section className="cad-model-parts">
                <h2>{m['cad.studio.parts']()}</h2>
                {(target.lid
                  ? (['body', 'lid'] as const)
                  : (['body'] as const)
                ).map((part) => (
                  <button
                    key={part}
                    type="button"
                    aria-pressed={selected === part}
                    onClick={() =>
                      setSelected((current) => (current === part ? null : part))
                    }
                  >
                    {part === 'lid' ? (
                      <Layers3 aria-hidden="true" />
                    ) : (
                      <Box aria-hidden="true" />
                    )}
                    {partLabel[part]()}
                  </button>
                ))}
              </section>
              <form className="cad-parameter-form" onSubmit={manualPreview}>
                <div className="cad-parameter-heading">
                  <h2>{m['cad.studio.dimensions']()}</h2>
                  <span>mm</span>
                </div>
                <div className="cad-parameter-fields">
                  {numberFields
                    .filter(([key]) => {
                      if (key === 'portWidth' || key === 'portHeight')
                        return draft.port !== 'none';
                      if (key === 'holeDiameter' || key === 'mountingInset')
                        return Number(draft.screwHoles) > 0;
                      return true;
                    })
                    .map(([key, label]) => (
                      <label key={key}>
                        <span>{label()}</span>
                        <input
                          type="number"
                          step={key === 'screwHoles' ? 1 : 'any'}
                          inputMode={
                            key === 'screwHoles' ? 'numeric' : 'decimal'
                          }
                          value={draft[key]}
                          onChange={(event) =>
                            setDraft((previous) => ({
                              ...previous,
                              [key]: event.target.value,
                            }))
                          }
                        />
                      </label>
                    ))}
                </div>
                <label className="cad-port-field">
                  <span>{m['cad.field.port']()}</span>
                  <select
                    value={draft.port}
                    onChange={(event) =>
                      setDraft((previous) => ({
                        ...previous,
                        port: event.target.value as Enclosure['port'],
                      }))
                    }
                  >
                    {(Object.keys(portOptions) as Enclosure['port'][]).map(
                      (port) => (
                        <option key={port} value={port}>
                          {portOptions[port]()}
                        </option>
                      )
                    )}
                  </select>
                </label>
                <label className="cad-lid-field">
                  <span>{m['cad.field.lid']()}</span>
                  <input
                    type="checkbox"
                    checked={draft.lid}
                    onChange={(event) =>
                      setDraft((previous) => ({
                        ...previous,
                        lid: event.target.checked,
                      }))
                    }
                  />
                </label>
                {fieldError && (
                  <p className="cad-field-error" role="alert">
                    {fieldError}
                  </p>
                )}
                <div className="cad-parameter-actions">
                  {editsPending && (
                    <button
                      type="button"
                      className="cad-button cad-button-secondary"
                      onClick={() => {
                        setDraft(parameterDraft(target));
                        setFieldError('');
                      }}
                    >
                      {m['cad.studio.reset_fields']()}
                    </button>
                  )}
                  <button
                    type="submit"
                    className="cad-button cad-button-secondary"
                    disabled={!editsPending || interpretation.isPending}
                  >
                    {m['cad.studio.preview']()}{' '}
                    <ArrowRight aria-hidden="true" />
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <section className="cad-inspector-scroll cad-model-parts cad-history-list">
              <h2>{m['cad.studio.revisions']()}</h2>
              {history.versions
                .map((revision, index) => (
                  <button
                    key={index}
                    disabled={Boolean(staged) || interpretation.isPending}
                    type="button"
                    aria-pressed={history.index === index}
                    onClick={() => moveHistory(index)}
                  >
                    <span className="cad-revision-icon">
                      <History aria-hidden="true" />
                    </span>
                    <span>
                      <strong>
                        {m['cad.studio.revision']({ count: index + 1 })}
                      </strong>
                      <small>
                        {revision.width} × {revision.depth} × {revision.height}{' '}
                        mm
                      </small>
                    </span>
                    {history.index === index && (
                      <Check
                        className="cad-current-version"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                ))
                .reverse()}
            </section>
          )}
        </aside>
      </main>
    </div>
  );
}
