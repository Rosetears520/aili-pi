"use client";

/** Shared helpers for turning absolute file paths into attachments or inserts. */

const IMAGE_EXTENSIONS: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
};

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export function imageMimeFor(name: string): string | undefined {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return undefined;
  return IMAGE_EXTENSIONS[name.slice(dot + 1).toLowerCase()];
}

export function quotePathIfNeeded(path: string): string {
  return /\s/.test(path) ? `"${path}"` : path;
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < buffer.length; index += chunk) {
    binary += String.fromCharCode(...buffer.subarray(index, index + chunk));
  }
  return btoa(binary);
}

export interface FetchedImageAttachment {
  readonly name: string;
  readonly data: string;
  readonly mimeType: string;
}

/**
 * Read a server-side image file as an attachment. Returns null when the read
 * fails or the file exceeds the attachment size limit — callers surface the
 * reason themselves.
 */
export async function fetchImageAttachment(absolutePath: string): Promise<FetchedImageAttachment | { error: string }> {
  const mime = imageMimeFor(absolutePath);
  if (!mime) return { error: "not an image" };
  const { encodeFilePathForApi } = await import("@/lib/file-paths");
  const response = await fetch(`/api/files/${encodeFilePathForApi(absolutePath)}?type=read`, { cache: "no-store" });
  if (!response.ok) return { error: `read failed (HTTP ${response.status})` };
  const blob = await response.blob();
  if (blob.size > MAX_IMAGE_BYTES) return { error: "image exceeds the 10 MB attachment limit" };
  const name = absolutePath.slice(absolutePath.lastIndexOf("/") + 1);
  return { name, data: await blobToBase64(blob), mimeType: mime };
}
