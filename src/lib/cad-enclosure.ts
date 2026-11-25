import { z } from 'zod';

export const enclosureSchema = z
  .object({
    width: z.number().min(20).max(300),
    depth: z.number().min(20).max(300),
    height: z.number().min(8).max(150),
    wallThickness: z.number().min(0.8).max(12),
    cornerRadius: z.number().min(0).max(45),
    lid: z.boolean(),
    screwHoles: z.number().int().min(0).max(4),
    holeDiameter: z.number().min(1).max(20),
    mountingInset: z.number().min(2).max(140),
    port: z.enum(['none', 'front', 'back', 'left', 'right']),
    portWidth: z.number().min(2).max(220),
    portHeight: z.number().min(2).max(140),
  })
  .strict()
  .superRefine((value, ctx) => {
    const minSide = Math.min(value.width, value.depth);
    const issue = (path: keyof typeof value, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });
    if (value.wallThickness * 2 + 3 >= Math.min(minSide, value.height)) {
      issue('wallThickness', 'walls');
    }
    if (value.cornerRadius >= minSide / 2 - 0.1) {
      issue('cornerRadius', 'corners');
    }
    if (value.screwHoles) {
      const clear = value.holeDiameter / 2 + 0.5;
      const innerInset = value.wallThickness + (value.lid ? 1.4 : 0);
      const roundedInset = value.cornerRadius * (1 - Math.SQRT1_2);
      if (
        value.mountingInset < Math.max(innerInset, roundedInset) + clear ||
        2 * (value.mountingInset + clear) >= minSide
      ) {
        issue('mountingInset', 'holes');
      }
    }
    if (value.port !== 'none') {
      const side = ['front', 'back'].includes(value.port)
        ? value.width
        : value.depth;
      if (
        value.portWidth +
          2 * Math.max(value.cornerRadius, value.wallThickness) +
          2 >=
        side
      ) {
        issue('portWidth', 'port');
      }
      if (value.portHeight + 2 * value.wallThickness + 2 >= value.height) {
        issue('portHeight', 'port');
      }
    }
  });

export type Enclosure = z.infer<typeof enclosureSchema>;
export type EnclosurePartName = 'body' | 'lid';

export const defaultEnclosure: Enclosure = {
  width: 100,
  depth: 60,
  height: 30,
  wallThickness: 2,
  cornerRadius: 6,
  lid: true,
  screwHoles: 4,
  holeDiameter: 3.2,
  mountingInset: 8,
  port: 'none',
  portWidth: 14,
  portHeight: 7,
};

export class CadInputError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'CadInputError';
  }
}

const numberPattern = '(\\d+(?:\\.\\d+)?|\\.\\d+)';
const unitPattern =
  '(millimet(?:er|re)s?|centimet(?:er|re)s?|mm|cm|inches|inch|in\\b|")?';
const measurementPattern = `${numberPattern}\\s*${unitPattern}`;

function millimeters(number: string, unit?: string) {
  const factor = unit?.startsWith('c')
    ? 10
    : unit?.startsWith('in') || unit === '"'
      ? 25.4
      : 1;
  return Math.round(Number(number) * factor * 100) / 100;
}

export function interpretEnclosurePrompt(
  input: string,
  current: Enclosure,
  selected?: EnclosurePartName
): Enclosure {
  const prompt = input
    .trim()
    .toLowerCase()
    .replace(/[×✕]/g, ' x ')
    .replace(/−/g, '-');
  if (!prompt || prompt.length > 1000 || /(?:^|[\s:=])-\s*\d/.test(prompt)) {
    throw new CadInputError('prompt');
  }
  const patch: Partial<Enclosure> = {};
  const portSize = prompt.match(
    new RegExp(
      `${measurementPattern}\\s*(?:x|(?:wide\\s+)?by)\\s*${measurementPattern}\\s*(?:high\\s+)?(?:(?:front|back|left|right|cable|usb)\\s+)*(?:port|opening|cut-?out)\\b`
    )
  );
  const modelPrompt = (
    portSize ? prompt.replace(portSize[0], ' port ') : prompt
  ).replace(/\b(?:port|opening|cut-?out)\s+(?:width|height)\b/g, ';');
  const dimensions = prompt.match(
    new RegExp(
      `\\b${measurementPattern}\\s*x\\s*${measurementPattern}\\s*x\\s*${measurementPattern}`,
      'i'
    )
  );
  if (dimensions) {
    const unit = dimensions[6] || dimensions[4] || dimensions[2];
    patch.width = millimeters(dimensions[1], dimensions[2] || unit);
    patch.depth = millimeters(dimensions[3], dimensions[4] || unit);
    patch.height = millimeters(dimensions[5], dimensions[6] || unit);
  }

  const fields = {
    width: 'width|wide',
    depth: 'depth|deep|length|long',
    height: 'height|high|tall',
    wallThickness: 'wall thickness|walls? thickness|(?:thick\\s+)?walls?',
    cornerRadius: 'corner radius|radius of (?:the )?corners?',
    holeDiameter:
      '(?:screw |mounting )?hole diameter|diameter of (?:the )?(?:screw |mounting )?holes?',
    mountingInset: 'mounting inset|edge offset|hole inset',
    portWidth: '(?:port|opening|cut-?out) width',
    portHeight: '(?:port|opening|cut-?out) height',
  } as const;
  for (const [key, labels] of Object.entries(fields) as [
    keyof typeof fields,
    string,
  ][]) {
    const text =
      key === 'width' || key === 'depth' || key === 'height'
        ? modelPrompt
        : prompt;
    const prefixed = text.match(
      new RegExp(
        `\\b(?:${labels})\\b\\s*(?:set to|to|of|is|=|:|at)?\\s*${measurementPattern}`
      )
    );
    const suffixed = text.match(
      new RegExp(`${measurementPattern}\\s+(?:${labels})\\b`)
    );
    const found = prefixed ?? suffixed;
    if (found) patch[key] = millimeters(found[1], found[2]);
  }

  const holeCount = prompt.match(
    new RegExp(
      `\\b(\\d+|zero|one|two|three|four)\\s+(?:${numberPattern}\\s*(mm|cm|inches|inch|in)\\s+)?(?:screw\\s+|mounting\\s+)?holes?\\b`
    )
  );
  if (holeCount) {
    const wordNumbers: Record<string, number> = {
      zero: 0,
      one: 1,
      two: 2,
      three: 3,
      four: 4,
    };
    patch.screwHoles = wordNumbers[holeCount[1]] ?? Number(holeCount[1]);
    if (holeCount[2] && patch.holeDiameter === undefined) {
      patch.holeDiameter = millimeters(holeCount[2], holeCount[3]);
    }
  } else if (/\b(?:add|with)\s+(?:screw|mounting)\s+holes\b/.test(prompt)) {
    patch.screwHoles = 4;
  }
  if (
    /\b(?:no|without|remove|delete)\s+(?:the\s+)?(?:screw\s+|mounting\s+)?holes\b/.test(
      prompt
    )
  ) {
    patch.screwHoles = 0;
  }
  if (/\b(?:square|sharp)\s+corners\b/.test(prompt)) patch.cornerRadius = 0;
  if (
    patch.cornerRadius === undefined &&
    /\bround(?:ed)?\s+(?:the\s+)?corners\b/.test(prompt)
  ) {
    patch.cornerRadius = current.cornerRadius || 4;
  }
  if (/\b(?:lid|cover|top plate)\b/.test(prompt)) {
    if (
      /\b(?:without|no|remove|delete)\s+(?:the\s+)?(?:lid|cover|top plate)\b/.test(
        prompt
      )
    ) {
      patch.lid = false;
    } else if (/\b(?:with|add|make|create|include|removable)\b/.test(prompt)) {
      patch.lid = true;
    }
  }
  if (
    selected === 'lid' &&
    /\b(?:remove|delete)\s+(?:it|this|selection)\b/.test(prompt)
  )
    patch.lid = false;
  if (/\b(?:nearer|closer)\s+to\s+(?:the\s+)?edges?\b/.test(prompt)) {
    patch.mountingInset = current.mountingInset - 1;
  }
  if (/\b(?:farther|further)\s+from\s+(?:the\s+)?edges?\b/.test(prompt)) {
    patch.mountingInset = current.mountingInset + 1;
  }

  if (/\b(?:port|cutout|cut-out|opening)\b/.test(prompt)) {
    const side = prompt.match(/\b(front|back|left|right)\b/)?.[1] as
      Enclosure['port'] | undefined;
    if (
      /\b(?:no|without|remove|delete)\s+(?:the\s+)?(?:port|cutout|cut-out|opening)\b/.test(
        prompt
      )
    ) {
      patch.port = 'none';
    } else {
      patch.port = side ?? (current.port === 'none' ? 'front' : current.port);
      const size =
        portSize ??
        (!dimensions
          ? prompt.match(
              new RegExp(`${measurementPattern}\\s*x\\s*${measurementPattern}`)
            )
          : null);
      if (size) {
        patch.portWidth ??= millimeters(size[1], size[2] || size[4]);
        patch.portHeight ??= millimeters(size[3], size[4] || size[2]);
      }
    }
  }

  if (
    !Object.keys(patch).length &&
    !/\b(?:create|make|design|generate)\b.*\b(?:box|enclosure|housing|case)\b/.test(
      prompt
    )
  ) {
    throw new CadInputError('unsupported');
  }
  const result = enclosureSchema.safeParse({ ...current, ...patch });
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new CadInputError(
      issue.code === 'custom' ? issue.message : 'dimensions'
    );
  }
  return result.data;
}

export type EnclosureMesh = {
  parts: {
    name: EnclosurePartName;
    vertices: Float32Array;
    normals: Float32Array;
    triangles: Uint32Array;
  }[];
};

export async function buildEnclosure(
  params: Enclosure
): Promise<EnclosureMesh> {
  const validated = enclosureSchema.parse(params);
  const keys = Object.keys(defaultEnclosure) as (keyof Enclosure)[];
  if (keys.every((key) => validated[key] === defaultEnclosure[key])) {
    const { default: mesh } = await import('./cad-default-mesh.json');
    return {
      parts: (['body', 'lid'] as const).map((name) => ({
        name,
        vertices: Float32Array.from(mesh[name].vertices),
        normals: Float32Array.from(mesh[name].normals),
        triangles: Uint32Array.from(mesh[name].triangles),
      })),
    };
  }
  const { meshEnclosure } = await import('./cad-kernel');
  return meshEnclosure(validated);
}

export async function exportEnclosure(
  mesh: EnclosureMesh,
  format: 'stl' | '3mf'
) {
  const { exportMesh } = await import('./cad-export');
  return exportMesh(mesh, format);
}
