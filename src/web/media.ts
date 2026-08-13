// The current Runtime contract bounds each JSON string to 65,536 characters
// and the BFF mutation body to 256 KiB. 48 KiB encodes to at most 65,536
// base64 characters; the combined bound leaves deterministic envelope space.
export const WEB_MEDIA_MAX_FILE_BYTES = 48 * 1024;
export const WEB_MEDIA_MAX_TOTAL_BYTES = 96 * 1024;
export const WEB_MEDIA_MAX_FILES = 10;
export const WEB_MEDIA_MAX_DIMENSION = 8_192;
export const WEB_MEDIA_MAX_PIXELS = 40_000_000;

export type SupportedWebImageMime = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

export interface BrowserMediaInput {
  readonly name: string;
  readonly declaredMimeType?: string;
  readonly bytes: Uint8Array;
  /** Browser-reported size permits rejection before reading oversized blobs. */
  readonly reportedSize?: number;
}

export interface ValidatedBrowserImage {
  readonly name: string;
  readonly mimeType: SupportedWebImageMime;
  readonly bytes: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly previewUrl: string;
}

export interface OfficialPiImageContent {
  readonly type: "image";
  readonly data: string;
  readonly mimeType: SupportedWebImageMime;
}

export type MediaFailureCode = "empty" | "too-many" | "oversized" | "total-oversized" | "unsupported" | "invalid-bytes" | "dimensions" | "model-incompatible";
export interface MediaFailure {
  readonly name: string;
  readonly code: MediaFailureCode;
  readonly message: string;
}
export interface MediaValidationResult {
  readonly accepted: readonly ValidatedBrowserImage[];
  readonly failures: readonly MediaFailure[];
  readonly ok: boolean;
}

/**
 * One bounded validator is shared by picker, paste, and drag/drop. MIME is
 * derived from bytes rather than trusted browser metadata.
 */
export function validateBrowserMedia(
  inputs: readonly BrowserMediaInput[],
  options: { readonly modelSupportsImages: boolean },
): MediaValidationResult {
  const accepted: ValidatedBrowserImage[] = [];
  const failures: MediaFailure[] = [];
  if (inputs.length > WEB_MEDIA_MAX_FILES) {
    failures.push(failure("selection", "too-many", `Select at most ${WEB_MEDIA_MAX_FILES} images`));
  }
  let totalBytes = 0;
  for (const input of inputs.slice(0, WEB_MEDIA_MAX_FILES)) {
    const name = boundedName(input.name);
    const reportedSize = input.reportedSize ?? input.bytes.byteLength;
    if (!Number.isSafeInteger(reportedSize) || reportedSize < 0) {
      failures.push(failure(name, "invalid-bytes", "The browser reported an invalid image size"));
      continue;
    }
    totalBytes += reportedSize;
    if (reportedSize > WEB_MEDIA_MAX_FILE_BYTES) {
      failures.push(failure(name, "oversized", `The image exceeds ${WEB_MEDIA_MAX_FILE_BYTES / 1024} KiB`));
      continue;
    }
    if (!(input.bytes instanceof Uint8Array) || input.bytes.byteLength === 0 || input.bytes.byteLength !== reportedSize) {
      failures.push(failure(name, "empty", "The image is empty or incomplete"));
      continue;
    }
    if (!options.modelSupportsImages) {
      failures.push(failure(name, "model-incompatible", "The selected model does not accept image input"));
      continue;
    }
    const inspected = inspectImage(input.bytes);
    if (!inspected) {
      failures.push(failure(name, "unsupported", "Only valid PNG, JPEG, WebP, or GIF image bytes are accepted"));
      continue;
    }
    if (input.declaredMimeType && normalizeMime(input.declaredMimeType) !== inspected.mimeType) {
      failures.push(failure(name, "invalid-bytes", "The declared media type does not match the image bytes"));
      continue;
    }
    if (inspected.width > WEB_MEDIA_MAX_DIMENSION || inspected.height > WEB_MEDIA_MAX_DIMENSION
      || inspected.width * inspected.height > WEB_MEDIA_MAX_PIXELS) {
      failures.push(failure(name, "dimensions", `Image dimensions exceed ${WEB_MEDIA_MAX_DIMENSION}px or ${WEB_MEDIA_MAX_PIXELS} pixels`));
      continue;
    }
    const copiedBytes = new Uint8Array(input.bytes);
    accepted.push(Object.freeze({
      name,
      mimeType: inspected.mimeType,
      bytes: copiedBytes,
      width: inspected.width,
      height: inspected.height,
      previewUrl: `data:${inspected.mimeType};base64,${base64(copiedBytes)}`,
    }));
  }
  if (totalBytes > WEB_MEDIA_MAX_TOTAL_BYTES) {
    accepted.splice(0, accepted.length);
    failures.push(failure("selection", "total-oversized", `Combined images exceed ${WEB_MEDIA_MAX_TOTAL_BYTES / 1024} KiB`));
  }
  return Object.freeze({ accepted: Object.freeze(accepted), failures: Object.freeze(failures), ok: failures.length === 0 });
}

/** Only validated bytes cross into the official Pi image-content shape. */
export function toOfficialPiImageContent(images: readonly ValidatedBrowserImage[]): readonly OfficialPiImageContent[] {
  if (images.length > WEB_MEDIA_MAX_FILES) throw new Error("validated image count exceeds its bound");
  let total = 0;
  return Object.freeze(images.map((image) => {
    total += image.bytes.byteLength;
    const inspected = inspectImage(image.bytes);
    if (!inspected || inspected.mimeType !== image.mimeType || inspected.width !== image.width || inspected.height !== image.height
      || image.bytes.byteLength > WEB_MEDIA_MAX_FILE_BYTES || total > WEB_MEDIA_MAX_TOTAL_BYTES) throw new Error("image changed after validation");
    return Object.freeze({ type: "image", data: base64(image.bytes), mimeType: image.mimeType });
  }));
}

export async function browserFilesToMediaInputs(files: readonly Blob[]): Promise<readonly BrowserMediaInput[]> {
  const bounded = files.slice(0, WEB_MEDIA_MAX_FILES + 1);
  return Promise.all(bounded.map(async (file, index) => {
    const named = file as Blob & { name?: string };
    if (file.size > WEB_MEDIA_MAX_FILE_BYTES) return Object.freeze({ name: boundedName(named.name ?? `image-${index + 1}`), declaredMimeType: file.type, bytes: new Uint8Array(), reportedSize: file.size });
    return Object.freeze({
      name: boundedName(named.name ?? `image-${index + 1}`),
      declaredMimeType: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
      reportedSize: file.size,
    });
  }));
}

export function mediaInputsFromDataTransfer(items: readonly { readonly type: string; getAsFile(): Blob | null }[]): readonly Blob[] {
  return items.filter((item) => item.type.startsWith("image/")).flatMap((item) => {
    const file = item.getAsFile();
    return file ? [file] : [];
  }).slice(0, WEB_MEDIA_MAX_FILES + 1);
}

function inspectImage(bytes: Uint8Array): { mimeType: SupportedWebImageMime; width: number; height: number } | undefined {
  return inspectPng(bytes) ?? inspectJpeg(bytes) ?? inspectWebp(bytes) ?? inspectGif(bytes);
}
function inspectPng(bytes: Uint8Array): ReturnType<typeof inspectImage> {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 45 || !signature.every((value, index) => bytes[index] === value) || u32be(bytes, 8) !== 13 || ascii(bytes, 12, 4) !== "IHDR") return undefined;
  const width = u32be(bytes, 16); const height = u32be(bytes, 20);
  let offset = 8;
  let sawImageData = false;
  let sawEnd = false;
  while (offset + 12 <= bytes.length) {
    const length = u32be(bytes, offset);
    if (!Number.isSafeInteger(length) || length > bytes.length - offset - 12) return undefined;
    const type = ascii(bytes, offset + 4, 4);
    if (type === "IDAT") sawImageData = true;
    if (type === "IEND") { if (length !== 0 || offset + 12 !== bytes.length) return undefined; sawEnd = true; break; }
    offset += 12 + length;
  }
  return sawImageData && sawEnd ? dimensions("image/png", width, height) : undefined;
}
function inspectGif(bytes: Uint8Array): ReturnType<typeof inspectImage> {
  if (bytes.length < 14 || !["GIF87a", "GIF89a"].includes(ascii(bytes, 0, 6)) || bytes.at(-1) !== 0x3b) return undefined;
  return dimensions("image/gif", u16le(bytes, 6), u16le(bytes, 8));
}
function inspectWebp(bytes: Uint8Array): ReturnType<typeof inspectImage> {
  if (bytes.length < 30 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP" || u32le(bytes, 4) + 8 !== bytes.length) return undefined;
  const format = ascii(bytes, 12, 4);
  if (format === "VP8X") return dimensions("image/webp", u24le(bytes, 24) + 1, u24le(bytes, 27) + 1);
  if (format === "VP8 " && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) return dimensions("image/webp", u16le(bytes, 26) & 0x3fff, u16le(bytes, 28) & 0x3fff);
  if (format === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) {
    const bits = bytes[21]! | bytes[22]! << 8 | bytes[23]! << 16 | bytes[24]! << 24;
    return dimensions("image/webp", (bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
  }
  return undefined;
}
function inspectJpeg(bytes: Uint8Array): ReturnType<typeof inspectImage> {
  if (bytes.length < 12 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) return undefined;
  let offset = 2;
  while (offset + 8 < bytes.length - 2) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1]!;
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) return undefined;
    const length = u16be(bytes, offset);
    if (length < 2 || offset + length > bytes.length) return undefined;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && length >= 7) {
      return dimensions("image/jpeg", u16be(bytes, offset + 5), u16be(bytes, offset + 3));
    }
    offset += length;
  }
  return undefined;
}
function dimensions(mimeType: SupportedWebImageMime, width: number, height: number): ReturnType<typeof inspectImage> { return width > 0 && height > 0 ? { mimeType, width, height } : undefined; }
function normalizeMime(value: string): SupportedWebImageMime | undefined {
  const normalized = value.trim().toLowerCase();
  if (normalized === "image/jpg") return "image/jpeg";
  return ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(normalized) ? normalized as SupportedWebImageMime : undefined;
}
function ascii(bytes: Uint8Array, offset: number, length: number): string { return String.fromCharCode(...bytes.slice(offset, offset + length)); }
function u16be(bytes: Uint8Array, offset: number): number { return bytes[offset]! * 256 + bytes[offset + 1]!; }
function u16le(bytes: Uint8Array, offset: number): number { return bytes[offset]! + bytes[offset + 1]! * 256; }
function u24le(bytes: Uint8Array, offset: number): number { return bytes[offset]! + bytes[offset + 1]! * 256 + bytes[offset + 2]! * 65_536; }
function u32be(bytes: Uint8Array, offset: number): number { return bytes[offset]! * 16_777_216 + bytes[offset + 1]! * 65_536 + bytes[offset + 2]! * 256 + bytes[offset + 3]!; }
function u32le(bytes: Uint8Array, offset: number): number { return bytes[offset]! + bytes[offset + 1]! * 256 + bytes[offset + 2]! * 65_536 + bytes[offset + 3]! * 16_777_216; }
function boundedName(value: string): string { return value.replace(/[\0\r\n]/g, "_").slice(0, 200) || "image"; }
function failure(name: string, code: MediaFailureCode, message: string): MediaFailure { return Object.freeze({ name, code, message }); }
function base64(bytes: Uint8Array): string {
  const bufferCtor = (globalThis as { Buffer?: { from(value: Uint8Array): { toString(encoding: string): string } } }).Buffer;
  if (bufferCtor) return bufferCtor.from(bytes).toString("base64");
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  return btoa(binary);
}
