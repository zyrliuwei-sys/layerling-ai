import { useQuery } from '@tanstack/react-query';

import { useSession } from '@/core/auth/client';
import { apiGet } from '@/lib/api-client';

export interface UserPermissions {
  isAdmin: boolean;
  permissions?: string[];
}

// Share the permission summary across the current account's navigation and layouts.
export function useUserPermissions(enabled = true) {
  const { data: session } = useSession();
  const userId = session?.user?.id;

  return useQuery({
    queryKey: ['user-permissions', userId],
    queryFn: () => apiGet<UserPermissions>('/api/user/permissions'),
    staleTime: 5 * 60_000,
    enabled: enabled && Boolean(userId),
  });
}
