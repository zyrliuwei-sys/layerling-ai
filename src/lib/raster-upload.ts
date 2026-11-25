const ascii = (bytes: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...bytes.subarray(start, start + length));

function hasImageBrand(
  bytes: Uint8Array,
  fileSize: number,
  brands: readonly string[]
) {
  if (bytes.length < 16 || ascii(bytes, 4, 4) !== 'ftyp') return false;
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const length = data.getUint32(0);
  if (length < 16 || length > fileSize) return false;
  if (brands.includes(ascii(bytes, 8, 4))) return true;
  for (
    let offset = 16;
    offset + 4 <= Math.min(length, bytes.length);
    offset += 4
  ) {
    if (brands.includes(ascii(bytes, offset, 4))) return true;
  }
  return false;
}

const rasterFormats = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/heic': 'heic',
  'image/heif': 'heif',
} as const;

const heicBrands = [
  'heic',
  'heix',
  'hevc',
  'hevx',
  'heis',
  'heim',
  'hevs',
  'hevm',
];

export function rasterExtension(mime: string) {
  return Object.hasOwn(rasterFormats, mime)
    ? rasterFormats[mime as keyof typeof rasterFormats]
    : undefined;
}

export function matchesRasterFormat(
  bytes: Uint8Array,
  extension: NonNullable<ReturnType<typeof rasterExtension>>,
  fileSize = bytes.length
) {
  switch (extension) {
    case 'jpg':
      return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case 'png':
      return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
        (byte, index) => bytes[index] === byte
      );
    case 'webp':
      return ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP';
    case 'gif':
      return ['GIF87a', 'GIF89a'].includes(ascii(bytes, 0, 6));
    case 'avif':
      return hasImageBrand(bytes, fileSize, ['avif', 'avis']);
    case 'heic':
      return hasImageBrand(bytes, fileSize, heicBrands);
    case 'heif':
      return hasImageBrand(bytes, fileSize, [...heicBrands, 'mif1', 'msf1']);
  }
}
