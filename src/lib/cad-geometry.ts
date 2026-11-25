import type { OcctKernel, ShapeHandle, Vec3 } from 'occt-wasm';

import type {
  Enclosure,
  EnclosureMesh,
  EnclosurePartName,
} from './cad-enclosure';

function roundedPrism(
  cad: OcctKernel,
  width: number,
  depth: number,
  radius: number,
  floor: number,
  height: number
): ShapeHandle {
  const x = width / 2;
  const y = depth / 2;
  const point = (x: number, y: number): Vec3 => ({ x, y, z: floor });
  if (radius < 0.001) {
    return cad.makeBoxFromCorners(point(-x, -y), { x, y, z: floor + height });
  }

  const centers = [
    [x - radius, -y + radius],
    [x - radius, y - radius],
    [-x + radius, y - radius],
    [-x + radius, -y + radius],
  ];
  const arc = (cx: number, cy: number, angle: number) =>
    point(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
  const edges: ShapeHandle[] = [];
  let start = point(-x + radius, -y);
  for (const [index, [cx, cy]] of centers.entries()) {
    const angle = ((index - 1) * Math.PI) / 2;
    const first = arc(cx, cy, angle);
    const middle = arc(cx, cy, angle + Math.PI / 4);
    const end = arc(cx, cy, angle + Math.PI / 2);
    edges.push(
      cad.makeLineEdge(start, first),
      cad.makeArcEdge(first, middle, end)
    );
    start = end;
  }
  return cad.extrude(cad.makeFace(cad.makeWire(edges)), 0, 0, height);
}

function screwClearance(
  cad: OcctKernel,
  shape: ShapeHandle,
  params: Enclosure,
  reach: number
) {
  const x = params.width / 2 - params.mountingInset;
  const y = params.depth / 2 - params.mountingInset;
  const positions = [
    [-x, -y],
    [x, y],
    [x, -y],
    [-x, y],
  ].slice(0, params.screwHoles);
  for (const [x, y] of positions) {
    const bore = cad.translate(
      cad.makeCylinder(params.holeDiameter / 2, reach + 2),
      x,
      y,
      -1
    );
    shape = cad.cut(shape, bore);
  }
  return shape;
}

function portClearance(cad: OcctKernel, params: Enclosure): ShapeHandle {
  const a = params.portWidth / 2;
  const edge = params.wallThickness + 1;
  const bottom = (params.height + params.wallThickness - params.portHeight) / 2;
  const top = bottom + params.portHeight;
  const x = params.width / 2;
  const y = params.depth / 2;
  const corners: Record<Exclude<Enclosure['port'], 'none'>, [Vec3, Vec3]> = {
    front: [
      { x: -a, y: -y - 1, z: bottom },
      { x: a, y: -y + edge, z: top },
    ],
    back: [
      { x: -a, y: y - edge, z: bottom },
      { x: a, y: y + 1, z: top },
    ],
    left: [
      { x: -x - 1, y: -a, z: bottom },
      { x: -x + edge, y: a, z: top },
    ],
    right: [
      { x: x - edge, y: -a, z: bottom },
      { x: x + 1, y: a, z: top },
    ],
  };
  if (params.port === 'none') throw new Error('geometry');
  return cad.makeBoxFromCorners(...corners[params.port]);
}

export function buildWithKernel(
  cad: OcctKernel,
  params: Enclosure
): EnclosureMesh {
  const mark = cad.checkpoint();
  try {
    const { width, depth, height, cornerRadius, wallThickness: wall } = params;
    const prism = (inset: number, floor: number, height: number) =>
      roundedPrism(
        cad,
        width - 2 * inset,
        depth - 2 * inset,
        Math.max(0, cornerRadius - inset),
        floor,
        height
      );
    let body = cad.cut(
      prism(0, 0, height),
      prism(wall, wall, height - wall + 1)
    );
    body = screwClearance(cad, body, params, wall);
    if (params.port !== 'none')
      body = cad.cut(body, portClearance(cad, params));

    const tessellate = (name: EnclosurePartName, shape: ShapeHandle) => {
      if (
        !cad.isValid(shape) ||
        cad.getSubShapes(shape, 'solid').length !== 1 ||
        cad.getVolume(shape) <= 0
      ) {
        throw new Error('geometry');
      }
      const mesh = cad.tessellate(shape, {
        linearDeflection: 0.025,
        angularDeflection: 0.2,
      });
      if (!mesh.triangleCount) throw new Error('geometry');
      return {
        name,
        vertices: mesh.positions.slice(),
        normals: mesh.normals.slice(),
        triangles: mesh.indices.slice(),
      };
    };
    const parts = [tessellate('body', body)];
    if (params.lid) {
      const lipHeight = Math.min(wall, (height - wall) / 3);
      const clearance = wall + 0.35;
      const lipWidth = Math.min(wall, 1);
      const lip = cad.cut(
        prism(clearance, 0, lipHeight + 0.1),
        prism(clearance + lipWidth, -0.2, lipHeight + 0.5)
      );
      const lid = cad.fuse(prism(0, lipHeight, wall), lip);
      parts.push(
        tessellate('lid', screwClearance(cad, lid, params, lipHeight + wall))
      );
    }
    return { parts };
  } finally {
    cad.releaseSince(mark);
  }
}
