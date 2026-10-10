// Rules for uploaded files. The same limits are enforced again by the database
// and the storage bucket (supabase/migrations/0003_document_files.sql); this is
// the friendly first check, and the place that builds safe file paths.

export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
export const FILES_BUCKET = "deal-documents";

// What may be uploaded: pictures, PDFs, Word, Excel, plain text. Never programs or web pages.
export const allowedTypes: Record<string, { label: string; extensions: string[] }> = {
  "application/pdf": { label: "PDF", extensions: ["pdf"] },
  "image/png": { label: "PNG image", extensions: ["png"] },
  "image/jpeg": { label: "JPG image", extensions: ["jpg", "jpeg"] },
  "image/webp": { label: "WebP image", extensions: ["webp"] },
  "image/heic": { label: "HEIC photo", extensions: ["heic"] },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { label: "Word document", extensions: ["docx"] },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { label: "Excel spreadsheet", extensions: ["xlsx"] },
  "text/plain": { label: "Text file", extensions: ["txt"] },
  "text/csv": { label: "CSV file", extensions: ["csv"] },
};

export const acceptAttribute = Object.values(allowedTypes)
  .flatMap((t) => t.extensions.map((e) => `.${e}`))
  .join(",");

export class FileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FileError";
  }
}

const extensionOf = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

// Browsers sometimes leave the type blank (Word and Excel often do), so fall back to the ending.
export function typeFor(name: string, reported: string): string | null {
  if (allowedTypes[reported]) return reported;
  const ext = extensionOf(name);
  return Object.keys(allowedTypes).find((t) => allowedTypes[t].extensions.includes(ext)) ?? null;
}

// Plain letters, numbers, dots, dashes and underscores only; no folders, no odd characters.
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, " ")
    .replace(/^\.+/, "")
    .trim();
  return cleaned.slice(-150) || "file";
}

export function validateUpload(file: { name: string; type: string; size: number }): { name: string; type: string } {
  if (file.size <= 0) throw new FileError(`"${file.name}" is empty.`);
  if (file.size > MAX_FILE_BYTES) {
    throw new FileError(`"${file.name}" is too large (${formatSize(file.size)}). The limit is ${formatSize(MAX_FILE_BYTES)}.`);
  }
  const type = typeFor(file.name, file.type);
  if (!type) {
    throw new FileError(`"${file.name}" isn't a type that can be uploaded. Use PDF, Word, Excel, text, or an image (PNG, JPG, WebP, HEIC).`);
  }
  return { name: safeFileName(file.name), type };
}

// <your id>/<deal id>/<random>-<name>: the first folder is what the storage lock checks.
export const buildPath = (userId: string, transactionId: string, name: string) =>
  `${userId}/${transactionId}/${crypto.randomUUID().slice(0, 8)}-${safeFileName(name)}`;

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(/\.0$/, "")} MB`;
}
