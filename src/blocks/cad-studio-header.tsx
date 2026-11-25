import type { ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';

import { Link } from '@/core/i18n/navigation';
import { envConfigs } from '@/config';
import { m } from '@/paraglide/messages.js';
import { useUserPermissions } from '@/hooks/use-user-permissions';

import '@/styles/cad-studio.css';

export function CadWorkspaceHeader({ children }: { children?: ReactNode }) {
  const { data: permissions } = useUserPermissions();

  return (
    <header className="cad-workspace-header">
      <Link href="/" className="cad-workspace-brand">
        <img src={envConfigs.app_logo} alt="" width={30} height={30} />
        <span>{envConfigs.app_name}</span>
      </Link>
      <nav
        aria-label={m['cad.studio.workspace_navigation']()}
        className="cad-workspace-nav"
      >
        <Link href="/studio">{m['cad.studio.title']()}</Link>
        <Link href="/projects">{m['cad.projects.title']()}</Link>
        <Link href="/examples">{m['cad.studio.examples']()}</Link>
        <Link href="/editor" className="cad-workspace-native">
          {m['cad.studio.layerling_editor']()}{' '}
          <ArrowUpRight aria-hidden="true" />
        </Link>
      </nav>
      <div className="cad-workspace-actions">
        {permissions?.isAdmin === true && (
          <Link className="cad-button cad-button-secondary" href="/admin">
            {m['common.systems.admin']()}
          </Link>
        )}
        {children}
      </div>
    </header>
  );
}
