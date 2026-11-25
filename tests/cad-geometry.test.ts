import assert from 'node:assert/strict';
import { test } from 'node:test';
import { strFromU8, unzipSync } from 'fflate';
import { OcctKernel } from 'occt-wasm';

import {
  buildEnclosure,
  CadInputError,
  defaultEnclosure,
  enclosureSchema,
  interpretEnclosurePrompt,
} from '../src/lib/cad-enclosure';
import { exportMesh } from '../src/lib/cad-export';
import { buildWithKernel } from '../src/lib/cad-geometry';

const kernel = OcctKernel.init();

test('prompt edits convert units and retain unmentioned enclosure features', () => {
  const resized = interpretEnclosurePrompt(
    'Make the box 12 cm wide and increase the wall thickness to 3mm.',
    defaultEnclosure
  );
  assert.deepEqual(resized, {
    ...defaultEnclosure,
    width: 120,
    wallThickness: 3,
  });
  const changed = interpretEnclosurePrompt('Remove it.', resized, 'lid');
  assert.equal(changed.lid, false);
  assert.equal(changed.width, 120);
  const detailed = interpretEnclosurePrompt(
    'Make it 3 mm thick walls with four 3mm screw holes and an 8 mm wide by 7 mm high front port.',
    defaultEnclosure
  );
  assert.deepEqual(detailed, {
    ...defaultEnclosure,
    wallThickness: 3,
    holeDiameter: 3,
    port: 'front',
    portWidth: 8,
  });
  assert.equal(
    interpretEnclosurePrompt('Set port width to 12 mm.', detailed).width,
    100
  );
  assert.throws(
    () =>
      interpretEnclosurePrompt('Make the wall thickness 11mm.', {
        ...defaultEnclosure,
        height: 20,
      }),
    CadInputError
  );
  assert.throws(
    () => interpretEnclosurePrompt('Sculpt a realistic dog.', defaultEnclosure),
    CadInputError
  );
});

test('kernel produces closed body and lid meshes with the requested box dimensions', async () => {
  const cad = await kernel;
  const mesh = buildWithKernel(
    cad,
    enclosureSchema.parse({ ...defaultEnclosure, port: 'front' })
  );
  assert.deepEqual(
    mesh.parts.map((part) => part.name),
    ['body', 'lid']
  );
  const vertices = mesh.parts[0].vertices;
  const bounds = [0, 1, 2].map((axis) => {
    const coordinates = vertices.filter((_, index) => index % 3 === axis);
    return Math.max(...coordinates) - Math.min(...coordinates);
  });
  assert.deepEqual(bounds, [100, 60, 30]);

  const stl = await exportMesh(mesh, 'stl').arrayBuffer();
  const triangles = new DataView(stl).getUint32(80, true);
  assert.ok(triangles > 100);
  assert.equal(stl.byteLength, 84 + 50 * triangles);

  const packed = await exportMesh(mesh, '3mf').arrayBuffer();
  const files = unzipSync(new Uint8Array(packed));
  assert.deepEqual(Object.keys(files).sort(), [
    '3D/3dmodel.model',
    '[Content_Types].xml',
    '_rels/.rels',
  ]);
  const model = strFromU8(files['3D/3dmodel.model']);
  assert.match(model, /unit="millimeter"/);
  assert.match(model, /name="body"/);
  assert.match(model, /name="lid"/);
  assert.equal(cad.shapeCount, 0);
});

test('the prebuilt starter mesh matches the geometry kernel exactly', async () => {
  const fromKernel = buildWithKernel(await kernel, defaultEnclosure);
  const prebuilt = await buildEnclosure(defaultEnclosure);
  assert.equal(prebuilt.parts.length, fromKernel.parts.length);
  for (const [index, part] of prebuilt.parts.entries()) {
    const expected = fromKernel.parts[index];
    assert.equal(part.name, expected.name);
    for (const attribute of ['vertices', 'normals', 'triangles'] as const) {
      assert.equal(part[attribute].length, expected[attribute].length);
      assert.ok(
        part[attribute].every(
          (value, offset) => value === expected[attribute][offset]
        ),
        `${part.name} ${attribute} must match the kernel mesh`
      );
    }
  }
  assert.ok(exportMesh(prebuilt, '3mf').size > 0);
});

test('validation blocks colliding holes and impossible ports and export rejects an open mesh', () => {
  assert.equal(
    enclosureSchema.safeParse({ ...defaultEnclosure, mountingInset: 2 })
      .success,
    false
  );
  assert.equal(
    enclosureSchema.safeParse({
      ...defaultEnclosure,
      port: 'left',
      portWidth: 59,
    }).success,
    false
  );
  assert.throws(
    () =>
      exportMesh(
        {
          parts: [
            {
              name: 'body',
              vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
              normals: new Float32Array(9),
              triangles: new Uint32Array([0, 1, 2]),
            },
          ],
        },
        'stl'
      ),
    /nonManifold/
  );
});
