import { OcctKernel } from 'occt-wasm';
import factoryAsset from 'occt-wasm/dist/occt-wasm.js?url';
import wasmAsset from 'occt-wasm/dist/occt-wasm.wasm?url';

import { enclosureSchema } from './cad-enclosure';
import { buildWithKernel } from './cad-geometry';

let kernel: Promise<OcctKernel> | undefined;

self.onmessage = async (
  event: MessageEvent<{ id: number; params: unknown }>
) => {
  const { id, params } = event.data;
  try {
    const parsed = enclosureSchema.parse(params);
    kernel ??= (async () => {
      const glue = new URL(factoryAsset, self.location.href).href;
      const { default: createModule } = await import(/* @vite-ignore */ glue);
      return OcctKernel.init({
        wasm: new URL(wasmAsset, self.location.href),
        createModule,
      });
    })().catch((error) => {
      kernel = undefined;
      throw error;
    });
    const mesh = buildWithKernel(await kernel, parsed);
    const transfers = mesh.parts.flatMap(({ vertices, normals, triangles }) => [
      vertices.buffer,
      normals.buffer,
      triangles.buffer,
    ]);
    self.postMessage({ id, mesh }, { transfer: transfers });
  } catch {
    self.postMessage({ id, error: 'geometry' });
  }
};
