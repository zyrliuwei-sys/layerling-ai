import { createFileRoute } from '@tanstack/react-router';
import { CadHttpError, withCadUser } from '@/server/cad/http';
import { z } from 'zod';

import { deleteProject, readProject } from '@/modules/cad/service';
import { respData, respOk } from '@/lib/resp';
import { m } from '@/paraglide/messages.js';

type Context = { request: Request; params: { id: string } };

function projectId(id: string) {
  if (!z.uuid().safeParse(id).success) {
    throw new CadHttpError(404, m['cad.api.project_missing']());
  }
  return id;
}

async function GET({ request, params }: Context) {
  return withCadUser(request, 'cad-project', async (userId) => {
    const project = await readProject(userId, projectId(params.id));
    if (!project) throw new CadHttpError(404, m['cad.api.project_missing']());
    return respData(project);
  });
}

async function DELETE({ request, params }: Context) {
  return withCadUser(request, 'cad-project', async (userId) => {
    if (!(await deleteProject(userId, projectId(params.id)))) {
      throw new CadHttpError(404, m['cad.api.project_missing']());
    }
    return respOk();
  });
}

export const Route = createFileRoute('/api/cad/projects/$id')({
  server: { handlers: { GET, DELETE } },
});
