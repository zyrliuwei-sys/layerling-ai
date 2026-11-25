import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { matchesRasterFormat, rasterExtension } from '../src/lib/raster-upload';

test('upload allow-list checks that the claimed image type matches the file signature', async () => {
  const image = await readFile(
    new URL('../public/imgs/cad/assembly-body.webp', import.meta.url)
  );
  assert.equal(matchesRasterFormat(image, 'webp'), true);
  assert.equal(matchesRasterFormat(image, 'png'), false);
  assert.equal(rasterExtension('image/svg+xml'), undefined);
  assert.equal(rasterExtension('image/jpeg'), 'jpg');
});

test('AVIF and HEIF use distinct image brands', () => {
  const avif = Buffer.from([
    0,
    0,
    0,
    16,
    ...Buffer.from('ftypavif'),
    0,
    0,
    0,
    0,
  ]);
  assert.equal(matchesRasterFormat(avif, 'avif'), true);
  assert.equal(matchesRasterFormat(avif, 'heif'), false);
  assert.equal(matchesRasterFormat(avif.subarray(0, 12), 'avif'), false);
});
