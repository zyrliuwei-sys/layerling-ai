import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createFileRoute } from '@tanstack/react-router';

import { getAuth } from '@/core/auth';
import { envConfigs } from '@/config';
import { getStorage } from '@/modules/storage/service';
import { md5 } from '@/lib/hash';
import { matchesRasterFormat, rasterExtension } from '@/lib/raster-upload';
import { enforceMinIntervalRateLimit } from '@/lib/rate-limit';
import { respData, respErr } from '@/lib/resp';

// Cap for the no-storage local-disk fallback (dev). Configurable via INLINE_IMAGE_MAX_KB.
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
// Per request: bounds memory (formData() buffers the whole body) and storage use.
const MAX_FILES_PER_REQUEST = 10;
const MAX_REQUEST_BYTES = 20 * 1024 * 1024;

const MAX_MULTIPART_BYTES = MAX_REQUEST_BYTES + 64 * 1024;

class UploadTooLarge extends Error {}

function readUpload(request: Request) {
  if (Number(request.headers.get('content-length')) > MAX_MULTIPART_BYTES) {
    throw new UploadTooLarge();
  }
  const contentType = request.headers.get('content-type');
  if (
    !request.body ||
    !contentType?.toLowerCase().startsWith('multipart/form-data;')
  ) {
    return null;
  }
  let size = 0;
  const bounded = request.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        size += chunk.byteLength;
        if (size > MAX_MULTIPART_BYTES) throw new UploadTooLarge();
        controller.enqueue(chunk);
      },
    })
  );
  return new Response(bounded, {
    headers: { 'content-type': contentType },
  }).formData();
}

const INLINE_MAX_BYTES =
  (Number(envConfigs.inline_image_max_kb) || 10240) * 1024;

async function POST({ request }: { request: Request }) {
  const limited = enforceMinIntervalRateLimit(request, {
    intervalMs: 1000,
    keyPrefix: 'upload-image',
  });
  if (limited) return limited;

  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) return respErr('Unauthorized');

    // Per account too: one user can't sidestep the IP bucket by switching networks.
    const userLimited = enforceMinIntervalRateLimit(request, {
      intervalMs: 1000,
      keyPrefix: 'upload-image',
      extraKey: session.user.id,
    });
    if (userLimited) return userLimited;

    let formData: FormData | null;
    try {
      formData = await readUpload(request);
    } catch (error) {
      if (error instanceof UploadTooLarge) {
        return respErr('Upload is larger than 20MB in total', { status: 413 });
      }
      return respErr('Invalid upload body', { status: 400 });
    }
    if (!formData)
      return respErr('A multipart image upload is required', { status: 415 });
    const files = formData.getAll('files');
    if (!files.length) return respErr('No files provided');
    if (files.length > MAX_FILES_PER_REQUEST) {
      return respErr(`At most ${MAX_FILES_PER_REQUEST} files per upload`);
    }

    const images: Array<{
      file: File;
      ext: NonNullable<ReturnType<typeof rasterExtension>>;
    }> = [];
    let total = 0;
    for (const file of files) {
      if (typeof file === 'string') return respErr('Expected an image file');
      const ext = rasterExtension(file.type);
      if (
        !ext ||
        !matchesRasterFormat(
          new Uint8Array(await file.slice(0, 128).arrayBuffer()),
          ext,
          file.size
        )
      ) {
        return respErr('Unsupported or invalid image file', { status: 415 });
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        return respErr('An image is larger than 10MB', { status: 413 });
      }
      total += file.size;
      images.push({ file, ext });
    }
    if (total > MAX_REQUEST_BYTES) {
      return respErr('Upload is larger than 20MB in total', { status: 413 });
    }

    const storage = await getStorage();
    const uploadResults: Array<{
      url: string;
      key: string;
      filename: string;
      deduped: boolean;
    }> = [];

    for (const { file, ext } of images) {
      const arrayBuffer = await file.arrayBuffer();
      const body = new Uint8Array(arrayBuffer);

      const digest = md5(body);
      // R2Provider prepends its own uploadPath (default `uploads`), so the object
      // key is the bare filename. The local fallback uses `public/uploads/<file>`.
      const objectKey = `${digest}.${ext}`;

      // No storage configured → persist to public/uploads and return a short
      // local URL. Avoids inlining a giant base64 data URL into DB columns (some
      // are varchar(255)). Configure R2 (admin → Storage) for production.
      if (!storage) {
        if (
          import.meta.env.PROD ||
          (globalThis as { __CF_ENV__?: unknown }).__CF_ENV__
        ) {
          return respErr('Image storage is unavailable', { status: 503 });
        }
        if (body.length > INLINE_MAX_BYTES) {
          const limitKb = Math.round(INLINE_MAX_BYTES / 1024);
          return respErr(
            `Image too large (${(body.length / 1024).toFixed(0)}KB > ${limitKb}KB). Configure storage or use a smaller image.`
          );
        }
        const dir = path.join(process.cwd(), 'public', 'uploads');
        await mkdir(dir, { recursive: true });
        await writeFile(path.join(dir, objectKey), body);
        uploadResults.push({
          url: `/uploads/${objectKey}`,
          key: `uploads/${objectKey}`,
          filename: file.name,
          deduped: false,
        });
        continue;
      }

      const exists = await storage.exists({ key: objectKey });
      if (exists) {
        const publicUrl = storage.getPublicUrl({ key: objectKey });
        if (publicUrl) {
          uploadResults.push({
            url: publicUrl,
            key: objectKey,
            filename: file.name,
            deduped: true,
          });
          continue;
        }
      }

      const result = await storage.uploadFile({
        body,
        key: objectKey,
        contentType: file.type,
        disposition: 'inline',
      });

      if (!result.success || !result.url) {
        return respErr('Upload failed', { status: 502 });
      }

      uploadResults.push({
        url: result.url,
        key: result.key || objectKey,
        filename: file.name,
        deduped: false,
      });
    }

    return respData({
      urls: uploadResults.map((r) => r.url),
      results: uploadResults,
    });
  } catch {
    console.error('Image upload failed');
    return respErr('Upload failed', { status: 500 });
  }
}

export const Route = createFileRoute('/api/storage/upload-image')({
  server: {
    handlers: { POST },
  },
});
