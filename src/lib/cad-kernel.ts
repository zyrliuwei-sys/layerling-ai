import type { Enclosure, EnclosureMesh } from './cad-enclosure';

let worker: Worker | undefined;
let nextId = 0;
const requests = new Map<
  number,
  {
    resolve: (mesh: EnclosureMesh) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }
>();

function stopWorker(code: string) {
  worker?.terminate();
  worker = undefined;
  for (const request of requests.values()) {
    clearTimeout(request.timeout);
    request.reject(new Error(code));
  }
  requests.clear();
}

export function meshEnclosure(params: Enclosure): Promise<EnclosureMesh> {
  if (!worker) {
    worker = new Worker(new URL('./cad.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onerror = () => stopWorker('geometry');
    worker.onmessage = ({
      data,
    }: MessageEvent<{ id: number; mesh?: EnclosureMesh; error?: string }>) => {
      const request = requests.get(data.id);
      if (!request) return;
      requests.delete(data.id);
      clearTimeout(request.timeout);
      if (data.mesh) request.resolve(data.mesh);
      else request.reject(new Error(data.error ?? 'geometry'));
    };
  }
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => stopWorker('geometryTimeout'), 60_000);
    requests.set(id, { resolve, reject, timeout });
    worker!.postMessage({ id, params });
  });
}
