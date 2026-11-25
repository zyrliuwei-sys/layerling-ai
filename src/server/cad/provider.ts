import { z } from 'zod';

import {
  enclosureSchema,
  type Enclosure,
  type EnclosurePartName,
} from '@/lib/cad-enclosure';
import { m } from '@/paraglide/messages.js';

import { CadHttpError } from './http';

const systemPrompt = [
  'Translate the request into parameters for an editable electronics enclosure. Output the requested JSON structure only.',
  'The user input may describe a new enclosure or edits to the current one. Preserve every existing value the user did not ask to change. The selected part is a hint about which component an edit refers to.',
  'Widths, depths, heights, thicknesses, offsets and diameters are in millimeters. Convert specified inches and centimeters. For three dimension numbers in order, use width, depth, height.',
  'There can be up to four mounting holes and one rectangular port. A new port goes on the front if no side is specified. The lid is a separate removable part. Check that the wall and radius fit and that holes and the port have clear space.',
  'If the request is outside the supported features or gives conflicting dimensions, respond with status clarify and a short question or explanation. Do not produce code, HTML, tool calls, or any model other than the enclosure.',
].join(' ');

const providerChoice = z.object({
  choices: z.tuple([
    z.object({ message: z.object({ content: z.string().max(16_000) }) }),
  ]),
});
const interpreted = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('update'),
      parameters: z.unknown(),
      explanation: z.null(),
    })
    .strict(),
  z
    .object({
      status: z.literal('clarify'),
      parameters: z.null(),
      explanation: z.string().trim().min(1).max(180),
    })
    .strict(),
]);

// Keep dimensional constraints in the same schema used by the editor and saver.
const { $schema: _schema, ...parameters } = z.toJSONSchema(enclosureSchema);
const responseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'parameters', 'explanation'],
  properties: {
    status: { type: 'string', enum: ['update', 'clarify'] },
    parameters: { anyOf: [parameters, { type: 'null' }] },
    explanation: { type: ['string', 'null'] },
  },
};

function completionEndpoint(base: string) {
  const endpoint = new URL(base || 'https://api.openai.com/v1');
  if (
    endpoint.protocol !== 'https:' ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash
  ) {
    throw new Error('OpenAI endpoint must be an HTTPS base URL');
  }
  endpoint.pathname = `${endpoint.pathname.replace(/\/+$/, '')}/chat/completions`;
  return endpoint;
}

export async function interpretWithOpenAI(options: {
  prompt: string;
  current: Enclosure;
  selected?: EnclosurePartName;
  apiKey: string;
  baseUrl: string;
}): Promise<Enclosure> {
  let result: z.infer<typeof interpreted>;
  try {
    const response = await fetch(completionEndpoint(options.baseUrl), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json',
      },
      redirect: 'error',
      signal: AbortSignal.timeout(25_000),
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_completion_tokens: 450,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'enclosure_change',
            strict: true,
            schema: responseSchema,
          },
        },
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: JSON.stringify({
              prompt: options.prompt,
              current: options.current,
              selected: options.selected,
            }),
          },
        ],
      }),
    });
    if (!response.ok) throw new Error('OpenAI request failed');
    const {
      choices: [{ message }],
    } = providerChoice.parse(await response.json());
    result = interpreted.parse(JSON.parse(message.content));
  } catch {
    throw new CadHttpError(502, m['cad.api.ai_unavailable']());
  }
  if (result.status === 'clarify')
    throw new CadHttpError(422, result.explanation);
  const geometry = enclosureSchema.safeParse(result.parameters);
  if (!geometry.success)
    throw new CadHttpError(422, m['cad.api.ai_invalid_geometry']());
  return geometry.data;
}
