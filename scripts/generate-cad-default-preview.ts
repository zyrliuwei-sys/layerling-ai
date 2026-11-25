import { writeFile } from 'node:fs/promises';
import { OcctKernel } from 'occt-wasm';

import { defaultEnclosure } from '../src/lib/cad-enclosure';
import { buildWithKernel } from '../src/lib/cad-geometry';

// Run with `pnpm exec tsx scripts/generate-cad-default-preview.ts` after
// changing the default parameters or the geometry kernel.
const mesh = buildWithKernel(await OcctKernel.init(), defaultEnclosure);
const parts = Object.fromEntries(
  mesh.parts.map(({ name, vertices, normals, triangles }) => [
    name,
    {
      vertices: Array.from(vertices),
      normals: Array.from(normals),
      triangles: Array.from(triangles),
    },
  ])
);
await writeFile(
  new URL('../src/lib/cad-default-mesh.json', import.meta.url),
  `${JSON.stringify(parts)}\n`
);
