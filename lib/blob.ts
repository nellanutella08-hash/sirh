import "server-only";
import { put, get, del } from "@vercel/blob";

const PREFIX = "conges";

export interface UploadedFile {
  pathname: string;
  originalName: string;
  size: number;
}

/** Uploads a congé justificatif (medical certificate, etc.) to the private
 * Blob store, scoped under conges/<employeId>/ so files can't collide. */
export async function uploadJustificatif(
  employeId: number,
  file: File
): Promise<UploadedFile> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const pathname = `${PREFIX}/${employeId}/${Date.now()}-${safeName}`;
  const blob = await put(pathname, file, { access: "private" });
  return { pathname: blob.pathname, originalName: file.name, size: file.size };
}

export async function readJustificatif(pathname: string) {
  if (!pathname.startsWith(`${PREFIX}/`)) return null;
  return get(pathname, { access: "private" });
}

export async function deleteJustificatif(pathname: string): Promise<void> {
  if (!pathname.startsWith(`${PREFIX}/`)) return;
  await del(pathname);
}
