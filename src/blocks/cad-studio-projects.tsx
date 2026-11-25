import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Box, FolderOpen, Plus, Trash2 } from 'lucide-react';

import { useSession } from '@/core/auth/client';
import { Link } from '@/core/i18n/navigation';
import { apiDelete, apiGet } from '@/lib/api-client';
import type { CadProjectSummary } from '@/lib/cad-api';
import { m } from '@/paraglide/messages.js';
import { useConfirm } from '@/hooks/use-confirm';

import { CadWorkspaceHeader } from './cad-studio-header';
import {
  deleteBrowserProject,
  getBrowserProjects,
} from './cad-studio-project-store';

const dateFormat = new Intl.DateTimeFormat('en', { dateStyle: 'medium' });

function ProjectRows({
  items,
  browser,
  remove,
  busy,
}: {
  items: CadProjectSummary[];
  browser?: boolean;
  remove: (project: CadProjectSummary) => void;
  busy: boolean;
}) {
  return (
    <ul className="cad-projects-list">
      {items.map((project) => (
        <li key={project.id}>
          <Link
            href="/studio"
            search={{
              project: project.id,
              ...(browser ? { browser: true } : {}),
            }}
          >
            <Box aria-hidden="true" /> <span>{project.name}</span>
          </Link>
          <div className="cad-project-date">
            <span>
              {m['cad.projects.updated']({
                date: dateFormat.format(project.updatedAt),
              })}
            </span>
            <span>
              {m['cad.projects.created']({
                date: dateFormat.format(project.createdAt),
              })}
            </span>
          </div>
          <div className="cad-projects-row-actions">
            <Link
              className="cad-button cad-button-secondary"
              href="/studio"
              search={{
                project: project.id,
                ...(browser ? { browser: true } : {}),
              }}
            >
              {m['cad.projects.open']()} <ArrowUpRight aria-hidden="true" />
            </Link>
            <button
              type="button"
              className="cad-button cad-button-secondary cad-button-icon"
              aria-label={m['cad.projects.delete_project']({
                name: project.name,
              })}
              disabled={busy}
              onClick={() => remove(project)}
            >
              <Trash2 aria-hidden="true" />
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function CadProjects() {
  const { data: session, isPending } = useSession();
  const userId = session?.user?.id;
  const [browserProjects, setBrowserProjects] = useState<CadProjectSummary[]>(
    []
  );
  useEffect(() => setBrowserProjects(getBrowserProjects()), []);
  const { confirm, dialog } = useConfirm();
  const queryClient = useQueryClient();
  const cloud = useQuery({
    queryKey: ['cad-projects', userId],
    queryFn: () => apiGet<{ items: CadProjectSummary[] }>('/api/cad/projects'),
    enabled: Boolean(userId),
    retry: false,
  });
  const remove = useMutation({
    mutationFn: async ({ id, browser }: { id: string; browser: boolean }) => {
      if (browser) {
        deleteBrowserProject(id);
        return;
      }
      await apiDelete(`/api/cad/projects/${encodeURIComponent(id)}`);
    },
    onSuccess(_: void, { id, browser }) {
      if (browser) {
        setBrowserProjects(getBrowserProjects());
      } else {
        void queryClient.invalidateQueries({
          queryKey: ['cad-projects', userId],
        });
      }
      queryClient.removeQueries({
        queryKey: ['cad-project', browser ? 'browser' : userId, id],
      });
    },
  });

  async function removeProject(project: CadProjectSummary, browser: boolean) {
    const okay = await confirm({
      title: m['cad.projects.delete_project']({ name: project.name }),
      description: m['cad.projects.delete_confirm'](),
      destructive: true,
    });
    if (okay) remove.mutate({ id: project.id, browser });
  }

  return (
    <div className="cad-workspace">
      <CadWorkspaceHeader>
        {userId ? (
          <Link className="cad-button cad-button-secondary" href="/settings">
            {m['cad.studio.account']()}
          </Link>
        ) : (
          <Link
            className="cad-button cad-button-secondary"
            href="/sign-in"
            search={{ callbackUrl: '/projects' }}
          >
            {m['cad.studio.sign_in']()}
          </Link>
        )}
      </CadWorkspaceHeader>
      <main className="cad-projects-page">
        <div className="cad-projects-intro">
          <div>
            <h1>{m['cad.projects.title']()}</h1>
            <p>{m['cad.projects.description']()}</p>
          </div>
          <Link className="cad-button cad-button-primary" href="/studio">
            <Plus aria-hidden="true" /> {m['cad.projects.new']()}
          </Link>
        </div>

        {isPending || userId ? (
          <section
            className="cad-projects-group"
            aria-labelledby="cad-cloud-title"
          >
            <h2 id="cad-cloud-title">{m['cad.projects.cloud']()}</h2>
            {isPending || cloud.isPending ? (
              <p className="cad-projects-empty" role="status">
                {m['cad.projects.loading']()}
              </p>
            ) : cloud.isError ? (
              <p className="cad-projects-error" role="alert">
                {m['cad.projects.load_error']()}
              </p>
            ) : cloud.data.items.length ? (
              <ProjectRows
                items={cloud.data.items}
                busy={remove.isPending}
                remove={(project) => void removeProject(project, false)}
              />
            ) : (
              <p className="cad-projects-empty">
                <FolderOpen aria-hidden="true" />{' '}
                {m['cad.projects.empty_cloud']()}
              </p>
            )}
          </section>
        ) : null}

        <section
          className="cad-projects-group"
          aria-labelledby="cad-browser-title"
        >
          <h2 id="cad-browser-title">{m['cad.projects.browser']()}</h2>
          {browserProjects.length ? (
            <ProjectRows
              items={browserProjects}
              browser
              busy={remove.isPending}
              remove={(project) => void removeProject(project, true)}
            />
          ) : (
            <p className="cad-projects-empty">
              <FolderOpen aria-hidden="true" />{' '}
              {m['cad.projects.empty_browser']()}
            </p>
          )}
        </section>
        {!isPending && !userId && (
          <div className="cad-projects-group">
            <p className="cad-projects-empty">
              {m['cad.projects.sign_in_description']()}
              <Link
                className="cad-button cad-button-secondary"
                href="/sign-in"
                search={{ callbackUrl: '/projects' }}
              >
                {m['cad.studio.sign_in']()}
              </Link>
            </p>
          </div>
        )}
        {remove.isError && (
          <p className="cad-projects-error" role="alert">
            {m['cad.projects.delete_error']()}
          </p>
        )}
      </main>
      {dialog}
    </div>
  );
}
