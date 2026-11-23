import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type StoredObject = { body: Buffer; contentType?: string };

export function storageDriver() {
  const explicit = (process.env.STORAGE_DRIVER || '').toLowerCase();
  if (explicit === 's3' || explicit === 'blob' || explicit === 'local') return explicit;
  if (process.env.BLOB_READ_WRITE_TOKEN) return 'blob';
  if (process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY) return 's3';
  return 'local';
}

export function uploadRoot() {
  return path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), 'data', 'uploads'));
}

function s3Config() {
  const bucket = process.env.S3_BUCKET || '';
  const region = process.env.S3_REGION || 'auto';
  const endpoint = process.env.S3_ENDPOINT || undefined;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID || '';
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || '';
  if (!bucket || !accessKeyId || !secretAccessKey) throw new Error('S3_BUCKET / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY が必要です');
  return { bucket, region, endpoint, accessKeyId, secretAccessKey };
}

async function s3Client() {
  const cfg = s3Config();
  const { S3Client } = await import('@aws-sdk/client-s3');
  return {
    cfg,
    client: new S3Client({
      region: cfg.region,
      endpoint: cfg.endpoint,
      forcePathStyle: Boolean(cfg.endpoint),
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    }),
  };
}

export async function putObject(id: string, body: Buffer, contentType: string) {
  const driver = storageDriver();
  if (driver === 's3') {
    const { cfg, client } = await s3Client();
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const key = `gix/${id}`;
    await client.send(new PutObjectCommand({ Bucket: cfg.bucket, Key: key, Body: body, ContentType: contentType }));
    return `s3:${key}`;
  }
  if (driver === 'blob') {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) throw new Error('BLOB_READ_WRITE_TOKEN が必要です');
    const { put } = await import('@vercel/blob');
    const created = await put(`gix/${id}`, body, { access: 'private', token, contentType });
    return `blob:${created.url}`;
  }
  const root = uploadRoot();
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, id), body);
  return `local:${id}`;
}

export async function getObject(key: string): Promise<StoredObject | null> {
  if (key.startsWith('s3:')) {
    const objectKey = key.slice(3);
    const { cfg, client } = await s3Client();
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const res = await client.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: objectKey }));
    const bytes = await res.Body?.transformToByteArray();
    if (!bytes) return null;
    return { body: Buffer.from(bytes), contentType: res.ContentType };
  }
  if (key.startsWith('blob:')) {
    const url = key.slice(5);
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) return null;
    const { get } = await import('@vercel/blob');
    const result = await get(url, { access: 'private', token });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    const chunks: Buffer[] = [];
    const reader = result.stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(Buffer.from(value));
    }
    return { body: Buffer.concat(chunks), contentType: result.blob.contentType };
  }
  const root = uploadRoot();
  const file = key.startsWith('local:') ? path.join(root, key.slice(6)) : path.resolve(key);
  const resolved = path.resolve(file);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) return null;
  const body = await readFile(resolved).catch(() => null);
  if (!body) return null;
  return { body };
}

export async function deleteObject(key: string) {
  if (!key) return;
  if (key.startsWith('s3:')) {
    const { cfg, client } = await s3Client();
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key.slice(3) })).catch(() => undefined);
    return;
  }
  if (key.startsWith('blob:')) {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) return;
    const { del } = await import('@vercel/blob');
    await del(key.slice(5), { token }).catch(() => undefined);
    return;
  }
  const root = uploadRoot();
  const file = key.startsWith('local:') ? path.join(root, key.slice(6)) : path.resolve(key);
  const resolved = path.resolve(file);
  if (resolved.startsWith(root + path.sep)) await unlink(resolved).catch(() => undefined);
}
