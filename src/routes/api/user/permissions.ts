import { createFileRoute } from '@tanstack/react-router';

import { getAuth } from '@/core/auth';
import { ADMIN_ACCESS_PERMISSION, matchPermission } from '@/core/auth/rbac';
import { getUserPermissionCodes } from '@/modules/rbac/service';
import { respData, respErr } from '@/lib/resp';

async function GET({ request }: { request: Request }) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) return respErr('Unauthorized', { status: 401 });

    const permissions = await getUserPermissionCodes(session.user.id);
    const isAdmin = matchPermission(ADMIN_ACCESS_PERMISSION, permissions);
    return respData({ isAdmin, permissions });
  } catch {
    return respErr('Could not load permissions', { status: 500 });
  }
}

export const Route = createFileRoute('/api/user/permissions')({
  server: {
    handlers: { GET },
  },
});
