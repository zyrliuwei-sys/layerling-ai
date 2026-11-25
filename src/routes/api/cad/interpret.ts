import { createFileRoute } from '@tanstack/react-router';
import { CadHttpError, readCadJson, withCadUser } from '@/server/cad/http';
import { interpretWithOpenAI } from '@/server/cad/provider';
import { z } from 'zod';

import {
  CadQuotaExceededError,
  getUsagePeriod,
  releaseOperation,
  remainingOperations,
  reserveOperation,
} from '@/modules/cad/service';
import { getAllConfigs } from '@/modules/config/service';
import { recordEvent } from '@/modules/events/service';
import { CAD_PROMPT_LIMIT, type CadPromptSource } from '@/lib/cad-api';
import {
  CadInputError,
  enclosureSchema,
  interpretEnclosurePrompt,
  type Enclosure,
} from '@/lib/cad-enclosure';
import { respData } from '@/lib/resp';
import { m } from '@/paraglide/messages.js';

const input = z
  .object({
    prompt: z.string().trim().min(1).max(CAD_PROMPT_LIMIT),
    current: enclosureSchema,
    selected: z.enum(['body', 'lid']).optional(),
  })
  .strict();

const promptErrors: Record<string, () => string> = {
  unsupported: m['cad.api.unsupported'],
  walls: m['cad.api.walls'],
  corners: m['cad.api.corners'],
  holes: m['cad.api.holes'],
  port: m['cad.api.port'],
  dimensions: m['cad.api.dimensions'],
};

async function GET({ request }: { request: Request }) {
  return withCadUser(request, 'cad-interpret', async (userId) => {
    const configs = await getAllConfigs();
    if (!configs.openai_api_key?.trim()) return respData({ source: 'rules' });

    const period = getUsagePeriod(userId);
    return respData({
      source: 'ai',
      limit: period.limit,
      remaining: await remainingOperations(period),
      resetsAt: period.resetsAt,
    });
  });
}

async function POST({ request }: { request: Request }) {
  return withCadUser(request, 'cad-interpret', async (userId) => {
    const body = input.parse(await readCadJson(request));
    const configs = await getAllConfigs();
    const apiKey = configs.openai_api_key?.trim();
    const period = getUsagePeriod(userId);
    let source: CadPromptSource = 'rules';
    if (apiKey) {
      try {
        await reserveOperation(period);
        source = 'ai';
      } catch (error) {
        if (!(error instanceof CadQuotaExceededError)) throw error;
      }
    }

    let params: Enclosure;
    try {
      params =
        apiKey && source === 'ai'
          ? await interpretWithOpenAI({
              ...body,
              apiKey,
              baseUrl: configs.openai_base_url?.trim() ?? '',
            })
          : interpretEnclosurePrompt(body.prompt, body.current, body.selected);
    } catch (error) {
      if (source === 'ai') await releaseOperation(period);
      if (error instanceof CadInputError) {
        throw new CadHttpError(
          422,
          (promptErrors[error.code] ?? m['cad.api.invalid_request'])()
        );
      }
      throw error;
    }

    await recordEvent({
      userId,
      kind: 'cad_prompt_interpreted',
      detail: { interpreter: source },
    });
    return respData({
      params,
      source,
      remaining:
        source === 'ai'
          ? await remainingOperations(period)
          : apiKey
            ? 0
            : undefined,
    });
  });
}

export const Route = createFileRoute('/api/cad/interpret')({
  server: { handlers: { GET, POST } },
});
