import { createFileRoute } from '@tanstack/react-router';
import { CadHttpError, readCadJson, withCadUser } from '@/server/cad/http';
import { z } from 'zod';

import {
  CadProjectConflictError,
  listProjects,
  saveProject,
} from '@/modules/cad/service';
import { CAD_HISTORY_LIMIT, CAD_PROJECT_NAME_LIMIT } from '@/lib/cad-api';
import { enclosureSchema } from '@/lib/cad-enclosure';
import { respData } from '@/lib/resp';
import { m } from '@/paraglide/messages.js';

const input = z
  .object({
    id: z.uuid().optional(),
    name: z.string().trim().min(1).max(CAD_PROJECT_NAME_LIMIT),
    versions: z.array(enclosureSchema).min(1).max(CAD_HISTORY_LIMIT),
    index: z.number().int().min(0),
    revision: z.int().positive().optional(),
  })
  .strict()
  .refine((project) => project.index < project.versions.length);

async function GET({ request }: { request: Request }) {
  return withCadUser(request, 'cad-projects', async (userId) =>
    respData({ items: await listProjects(userId) })
  );
}

async function POST({ request }: { request: Request }) {
  return withCadUser(request, 'cad-projects', async (userId) => {
    const body = input.parse(await readCadJson(request));
    try {
      const project = await saveProject(userId, body);
      if (!project) throw new CadHttpError(404, m['cad.api.project_missing']());
      return respData(project, { status: body.id ? 200 : 201 });
    } catch (error) {
      if (error instanceof CadProjectConflictError) {
        throw new CadHttpError(409, m['cad.api.project_conflict']());
      }
      throw error;
    }
  });
}

export const Route = createFileRoute('/api/cad/projects')({
  server: { handlers: { GET, POST } },
});
