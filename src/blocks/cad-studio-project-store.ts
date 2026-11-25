import { z } from 'zod';

import {
  CAD_HISTORY_LIMIT,
  CAD_PROJECT_NAME_LIMIT,
  type CadProject,
} from '@/lib/cad-api';
import { enclosureSchema } from '@/lib/cad-enclosure';

const browserProjectSchema = z
  .object({
    id: z.uuid(),
    name: z.string().min(1).max(CAD_PROJECT_NAME_LIMIT),
    versions: z.array(enclosureSchema).min(1).max(CAD_HISTORY_LIMIT),
    index: z.number().int().nonnegative(),
    revision: z.number().int().positive(),
    createdAt: z.number(),
    updatedAt: z.number(),
  })
  .refine((project) => project.index < project.versions.length);

const storageKey = 'layerling-ai:cad-projects';

export function getBrowserProjects(): CadProject[] {
  try {
    const stored: unknown = JSON.parse(
      localStorage.getItem(storageKey) ?? '[]'
    );
    if (!Array.isArray(stored)) return [];
    return stored.flatMap((candidate) => {
      const result = browserProjectSchema.safeParse(candidate);
      return result.success ? [result.data] : [];
    });
  } catch {
    return [];
  }
}

export function saveBrowserProject(
  data: Pick<CadProject, 'name' | 'versions' | 'index'>,
  id?: string,
  revision?: number
): CadProject {
  const others = getBrowserProjects();
  const existing = others.find((project) => project.id === id);
  if (id && (!existing || existing.revision !== revision))
    throw new Error('projectConflict');
  const now = Date.now();
  const project = browserProjectSchema.parse({
    ...data,
    id: existing?.id ?? crypto.randomUUID(),
    revision: (existing?.revision ?? 0) + 1,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });
  localStorage.setItem(
    storageKey,
    JSON.stringify([
      project,
      ...others.filter((other) => other.id !== project.id),
    ])
  );
  return project;
}

export function deleteBrowserProject(id: string) {
  localStorage.setItem(
    storageKey,
    JSON.stringify(getBrowserProjects().filter((project) => project.id !== id))
  );
}
