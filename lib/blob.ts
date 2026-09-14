import "server-only";
import { put, get, del } from "@vercel/blob";

const ALLOWED_PREFIXES = ["conges", "recrutement", "documents"] as const;
type Prefix = (typeof ALLOWED_PREFIXES)[number];

export interface UploadedFile {
  pathname: string;
  originalName: string;
  size: number;
}

/** Uploads a file (congé justificatif, candidate CV, …) to the private Blob
 * store, scoped under <prefix>/<scopeId>/ so files can't collide or be
 * guessed across unrelated records. */
export async function uploadPrivateFile(
  prefix: Prefix,
  scopeId: string | number,
  file: File
): Promise<UploadedFile> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const pathname = `${prefix}/${scopeId}/${Date.now()}-${safeName}`;
  const blob = await put(pathname, file, { access: "private" });
  return { pathname: blob.pathname, originalName: file.name, size: file.size };
}

/** Same as uploadPrivateFile, for content generated server-side (e.g. a
 * PDF built with jsPDF) rather than a user-picked File. */
export async function uploadPrivateBuffer(
  prefix: Prefix,
  scopeId: string | number,
  filename: string,
  contentType: string,
  data: Buffer
): Promise<UploadedFile> {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const pathname = `${prefix}/${scopeId}/${Date.now()}-${safeName}`;
  const blob = await put(pathname, data, { access: "private", contentType });
  return { pathname: blob.pathname, originalName: filename, size: data.byteLength };
}

export async function readPrivateFile(pathname: string) {
  if (!ALLOWED_PREFIXES.some((p) => pathname.startsWith(`${p}/`))) return null;
  return get(pathname, { access: "private" });
}

export async function deletePrivateFile(pathname: string): Promise<void> {
  if (!ALLOWED_PREFIXES.some((p) => pathname.startsWith(`${p}/`))) return;
  await del(pathname);
}
