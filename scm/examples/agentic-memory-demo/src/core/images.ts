// Local-only image attachments for memory records - deliberately kept
// out of @justjs/memory's own MemoryRecord shape. "An optional image
// per record" is this app's own feature, not something every consumer
// of the shared package needs, so it lives in a separate localStorage
// entry keyed by record id instead of a schema change to the package.
const IMAGES_STORAGE_KEY = "justjs:memory-demo:images";

function loadImageMap(): Record<string, string> {
  try {
    const raw = globalThis.localStorage?.getItem(IMAGES_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveImageMap(map: Record<string, string>): void {
  try {
    globalThis.localStorage?.setItem(IMAGES_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Best-effort only, same rationale as the rest of this app's
    // localStorage writes - a full/disabled store shouldn't break the
    // in-memory operation that just succeeded.
  }
}

export function getImageForRecord(recordId: string): string | null {
  return loadImageMap()[recordId] ?? null;
}

export function setImageForRecord(recordId: string, dataUrl: string): void {
  const map = loadImageMap();
  map[recordId] = dataUrl;
  saveImageMap(map);
}

export function deleteImageForRecord(recordId: string): void {
  const map = loadImageMap();
  if (recordId in map) {
    delete map[recordId];
    saveImageMap(map);
  }
}

export function readImageFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read image file"));
    reader.readAsDataURL(file);
  });
}
