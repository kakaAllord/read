import { HttpError, withToken } from "./auth";

const FILES = "https://www.googleapis.com/drive/v3/files";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
export const FOLDER_MIME = "application/vnd.google-apps.folder";

export type DriveFile = { id: string; name: string; mimeType: string; size?: string };

async function check(res: Response): Promise<Response> {
  if (res.ok) return res;
  const body = await res.text().catch(() => "");
  throw new HttpError(res.status, `Drive ${res.status}: ${body.slice(0, 300)}`);
}

export function listFiles(query: string): Promise<DriveFile[]> {
  return withToken(async (token) => {
    const url = new URL(FILES);
    url.searchParams.set("q", query);
    url.searchParams.set("fields", "files(id,name,mimeType,size)");
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("spaces", "drive");
    const res = await check(
      await fetch(url, { headers: { Authorization: `Bearer ${token}` } }),
    );
    return ((await res.json()) as { files?: DriveFile[] }).files ?? [];
  });
}

export function createFolder(name: string, parentId?: string): Promise<DriveFile> {
  return withToken(async (token) => {
    const res = await check(
      await fetch(`${FILES}?fields=id,name,mimeType`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          mimeType: FOLDER_MIME,
          ...(parentId ? { parents: [parentId] } : {}),
        }),
      }),
    );
    return (await res.json()) as DriveFile;
  });
}

/* Drive query strings are single-quoted, so a backslash or an apostrophe in a
   file name has to be escaped or the query is a syntax error. */
const escapeQ = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

export async function findFolder(name: string, parentId?: string): Promise<DriveFile | null> {
  const parts = [
    `name = '${escapeQ(name)}'`,
    `mimeType = '${FOLDER_MIME}'`,
    "trashed = false",
    parentId ? `'${parentId}' in parents` : null,
  ].filter(Boolean);
  const files = await listFiles(parts.join(" and "));
  return files[0] ?? null;
}

export async function ensureFolder(name: string, parentId?: string): Promise<string> {
  const found = await findFolder(name, parentId);
  if (found) return found.id;
  return (await createFolder(name, parentId)).id;
}

export async function findFile(name: string, parentId: string): Promise<DriveFile | null> {
  const files = await listFiles(
    `name = '${escapeQ(name)}' and '${parentId}' in parents and trashed = false`,
  );
  return files[0] ?? null;
}

/** Small text payloads — library.json, a month of journal — go multipart. */
export function putTextFile(
  name: string,
  parentId: string,
  content: string,
  mimeType: string,
  fileId?: string,
): Promise<DriveFile> {
  return withToken(async (token) => {
    const boundary = "read-" + Math.random().toString(36).slice(2);
    const metadata = fileId ? {} : { name, parents: [parentId] };
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: ${mimeType}; charset=UTF-8\r\n\r\n` +
      `${content}\r\n--${boundary}--`;
    const url = fileId
      ? `${UPLOAD}/${fileId}?uploadType=multipart&fields=id,name,mimeType`
      : `${UPLOAD}?uploadType=multipart&fields=id,name,mimeType`;
    const res = await check(
      await fetch(url, {
        method: fileId ? "PATCH" : "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body,
      }),
    );
    return (await res.json()) as DriveFile;
  });
}

export function getFileText(fileId: string): Promise<string> {
  return withToken(async (token) => {
    const res = await check(
      await fetch(`${FILES}/${fileId}?alt=media`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    return res.text();
  });
}

export function getFileBytes(fileId: string): Promise<ArrayBuffer> {
  return withToken(async (token) => {
    const res = await check(
      await fetch(`${FILES}/${fileId}?alt=media`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    return res.arrayBuffer();
  });
}

export function getFileMeta(fileId: string): Promise<DriveFile> {
  return withToken(async (token) => {
    const res = await check(
      await fetch(`${FILES}/${fileId}?fields=id,name,mimeType,size`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    return (await res.json()) as DriveFile;
  });
}

/**
 * Books go up resumably. Multipart caps out around 5MB and book files clear
 * that routinely, and a resumable session is what makes a progress bar
 * honest rather than decorative.
 */
export function uploadResumable(
  file: Blob,
  name: string,
  parentId: string,
  onProgress?: (fraction: number) => void,
): Promise<DriveFile> {
  return withToken(async (token) => {
    const start = await check(
      await fetch(`${UPLOAD}?uploadType=resumable&fields=id,name,mimeType`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Type": file.type || "application/octet-stream",
          "X-Upload-Content-Length": String(file.size),
        },
        body: JSON.stringify({ name, parents: [parentId] }),
      }),
    );
    const session = start.headers.get("Location");
    if (!session) throw new HttpError(500, "Drive did not open an upload session.");

    return new Promise<DriveFile>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", session, true);
      xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress?.(e.loaded / e.total);
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress?.(1);
          resolve(JSON.parse(xhr.responseText) as DriveFile);
        } else {
          reject(new HttpError(xhr.status, `Drive ${xhr.status}: ${xhr.responseText.slice(0, 300)}`));
        }
      };
      xhr.onerror = () => reject(new HttpError(0, "The upload connection failed."));
      xhr.send(file);
    });
  });
}
