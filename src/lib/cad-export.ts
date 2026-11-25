import { strToU8, zipSync } from 'fflate';

import type { EnclosureMesh } from './cad-enclosure';

type PrintPart = {
  name: string;
  vertices: number[];
  triangles: number[];
};

function printParts(mesh: EnclosureMesh): PrintPart[] {
  if (!mesh.parts.length) throw new Error('emptyMesh');
  let nextLeft = 0;
  return mesh.parts.map(({ name, vertices, triangles }) => {
    if (
      !vertices.length ||
      !triangles.length ||
      triangles.length % 3 ||
      !vertices.every(Number.isFinite)
    ) {
      throw new Error('invalidMesh');
    }
    let left = Infinity;
    let right = -Infinity;
    let top = -Infinity;
    for (let i = 0; i < vertices.length; i += 3) {
      left = Math.min(left, vertices[i]);
      right = Math.max(right, vertices[i]);
      top = Math.max(top, vertices[i + 2]);
    }
    const xOffset = nextLeft - left;
    nextLeft += right - left + 8;
    // Print the lid face down, with its retaining lip pointing away from the bed.
    const output: number[] = [];
    const vertexIds = new Map<string, number>();
    const remap: number[] = [];
    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i] + xOffset;
      const y = name === 'lid' ? -vertices[i + 1] : vertices[i + 1];
      const z = name === 'lid' ? top - vertices[i + 2] : vertices[i + 2];
      const key = [x, y, z]
        .map((coordinate) => Math.round(coordinate * 10000))
        .join(',');
      let index = vertexIds.get(key);
      if (index === undefined) {
        index = output.length / 3;
        vertexIds.set(key, index);
        output.push(x, y, z);
      }
      remap.push(index);
    }

    const faces: number[] = [];
    const edges = new Map<string, { incidence: number; winding: number }>();
    for (let i = 0; i < triangles.length; i += 3) {
      const a = remap[triangles[i]];
      const b = remap[triangles[i + 1]];
      const c = remap[triangles[i + 2]];
      if (a === undefined || b === undefined || c === undefined)
        throw new Error('invalidMesh');
      if (a === b || b === c || c === a) continue;
      faces.push(a, b, c);
      for (const [from, to] of [
        [a, b],
        [b, c],
        [c, a],
      ]) {
        const edge = from < to ? `${from}/${to}` : `${to}/${from}`;
        const state = edges.get(edge) ?? { incidence: 0, winding: 0 };
        state.incidence++;
        state.winding += from < to ? 1 : -1;
        edges.set(edge, state);
      }
    }
    if (
      !faces.length ||
      [...edges.values()].some(
        ({ incidence, winding }) => incidence !== 2 || winding !== 0
      )
    ) {
      throw new Error('nonManifold');
    }
    return { name, vertices: output, triangles: faces };
  });
}

function asStl(parts: PrintPart[]) {
  const count = parts.reduce(
    (total, part) => total + part.triangles.length / 3,
    0
  );
  const output = new ArrayBuffer(84 + 50 * count);
  const view = new DataView(output);
  view.setUint32(80, count, true);
  let offset = 84;
  for (const { vertices, triangles } of parts) {
    for (let i = 0; i < triangles.length; i += 3) {
      const coords = triangles
        .slice(i, i + 3)
        .flatMap((id) => vertices.slice(id * 3, id * 3 + 3));
      const [ax, ay, az, bx, by, bz, cx, cy, cz] = coords;
      const [ux, uy, uz] = [bx - ax, by - ay, bz - az];
      const [vx, vy, vz] = [cx - ax, cy - ay, cz - az];
      const normal = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
      const area = Math.hypot(...normal);
      if (!area) throw new Error('invalidMesh');
      for (const value of [...normal.map((n) => n / area), ...coords]) {
        view.setFloat32(offset, value, true);
        offset += 4;
      }
      offset += 2;
    }
  }
  return new Blob([output], { type: 'model/stl' });
}

function as3mf(parts: PrintPart[]) {
  const objects = parts.map(({ name, vertices, triangles }, index) => {
    const points = [];
    const faces = [];
    for (let i = 0; i < vertices.length; i += 3) {
      points.push(
        `<vertex x="${vertices[i].toFixed(6)}" y="${vertices[i + 1].toFixed(6)}" z="${vertices[i + 2].toFixed(6)}"/>`
      );
    }
    for (let i = 0; i < triangles.length; i += 3) {
      faces.push(
        `<triangle v1="${triangles[i]}" v2="${triangles[i + 1]}" v3="${triangles[i + 2]}"/>`
      );
    }
    return `<object id="${index + 1}" name="${name}" type="model"><mesh><vertices>${points.join('')}</vertices><triangles>${faces.join('')}</triangles></mesh></object>`;
  });
  const items = parts.map((_, index) => `<item objectid="${index + 1}"/>`);
  const model = `<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources>${objects.join('')}</resources><build>${items.join('')}</build></model>`;
  const types =
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>';
  const root =
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>';
  const zip = zipSync({
    '[Content_Types].xml': strToU8(types),
    '_rels/.rels': strToU8(root),
    '3D/3dmodel.model': strToU8(model),
  });
  return new Blob([new Uint8Array(zip)], { type: 'model/3mf' });
}

export function exportMesh(mesh: EnclosureMesh, format: 'stl' | '3mf') {
  const parts = printParts(mesh);
  return format === 'stl' ? asStl(parts) : as3mf(parts);
}
