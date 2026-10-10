"use client";

import { useRef, useState } from "react";
import Icon from "@/components/Icon";
import { useToast } from "@/components/ToastProvider";
import { db } from "@/lib/data";
import { acceptAttribute, allowedTypes, formatSize, MAX_FILE_BYTES, typeFor } from "@/lib/data/files";
import { formatDate } from "@/lib/format";
import type { DocumentFile, DocumentItem } from "@/lib/types";

// Upload, download and remove files for one deal. Files live in a private store
// that only the signed-in owner can open, and each download link works for a minute.

export default function FilesPanel({
  transactionId,
  documents,
  files,
  onUploaded,
  onRemoved,
  onDocumentReceived,
}: {
  transactionId: string;
  documents: DocumentItem[];
  files: DocumentFile[];
  onUploaded: (file: DocumentFile) => void;
  onRemoved: (id: string) => void;
  onDocumentReceived: (doc: DocumentItem) => void;
}) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [documentId, setDocumentId] = useState("");
  const [markReceived, setMarkReceived] = useState(true);
  const [busy, setBusy] = useState("");
  const [dragging, setDragging] = useState(false);

  const chosen = documents.find((d) => d.id === documentId);
  const docName = (id: string | null) => documents.find((d) => d.id === id)?.name;

  if (!db.filesSupported) {
    return (
      <section className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-8 text-center">
        <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
          <Icon name="shield" className="h-6 w-6" />
        </span>
        <h2 className="text-base font-bold text-slate-900">File uploads need an account</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
          This demo keeps everything in your browser, which has no safe place for contracts and receipts. Log in to an
          account to attach files to a deal.
        </p>
      </section>
    );
  }

  async function upload(list: FileList | File[]) {
    const picked = Array.from(list);
    for (const file of picked) {
      setBusy(file.name);
      try {
        const saved = await db.uploadFile(transactionId, documentId || null, file);
        onUploaded(saved);
        if (chosen && markReceived && chosen.status !== "received") {
          const updated = { ...chosen, status: "received" as const };
          await db.saveDocument(updated);
          onDocumentReceived(updated);
        }
        toast(`Uploaded ${saved.fileName}.`);
      } catch (e) {
        toast(`Couldn't upload ${file.name}: ${e instanceof Error ? e.message : "unknown error"}`, "error");
      }
    }
    setBusy("");
    if (input.current) input.current.value = "";
  }

  async function download(file: DocumentFile) {
    try {
      const url = await db.fileUrl(file.id);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.fileName;
      a.click();
    } catch (e) {
      toast(`Couldn't open ${file.fileName}: ${e instanceof Error ? e.message : "unknown error"}`, "error");
    }
  }

  async function remove(file: DocumentFile) {
    if (!window.confirm(`Remove ${file.fileName}? This can't be undone.`)) return;
    try {
      await db.deleteFile(file.id);
      onRemoved(file.id);
      toast(`Removed ${file.fileName}.`);
    } catch (e) {
      toast(`Couldn't remove ${file.fileName}: ${e instanceof Error ? e.message : "unknown error"}`, "error");
    }
  }

  return (
    <section className="mt-6 space-y-4" aria-label="Files">
      <div>
        <h2 className="text-sm font-bold text-slate-900">Files</h2>
        <p className="text-xs text-slate-500">
          Private to your account. Up to {formatSize(MAX_FILE_BYTES)} each: PDF, Word, Excel, text or images.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Attach to</span>
          <select
            aria-label="Attach to"
            value={documentId}
            onChange={(e) => setDocumentId(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
          >
            <option value="">This deal (no specific document)</option>
            {documents.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        {chosen && chosen.status !== "received" && (
          <label className="flex items-end gap-2 pb-2.5 text-sm text-slate-700">
            <input type="checkbox" checked={markReceived} onChange={(e) => setMarkReceived(e.target.checked)} />
            Mark as received
          </label>
        )}
      </div>

      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!busy) void upload(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed px-6 py-8 text-center ${
          dragging ? "border-indigo-500 bg-indigo-50" : "border-slate-300 bg-white hover:border-indigo-300 hover:bg-indigo-50/40"
        }`}
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
          <Icon name="plus" className="h-6 w-6" />
        </span>
        <span className="text-sm font-bold text-slate-900">{busy ? `Uploading ${busy}…` : "Drop files here, or click to choose"}</span>
        <span className="text-xs text-slate-500">PDF, Word, Excel, text, PNG, JPG, WebP, HEIC</span>
        <input
          ref={input}
          type="file"
          multiple
          aria-label="Choose files"
          accept={acceptAttribute}
          disabled={Boolean(busy)}
          onChange={(e) => e.target.files && void upload(e.target.files)}
          className="sr-only"
        />
      </label>
      {busy && <p role="status" className="text-sm text-slate-500">Uploading {busy}…</p>}

      {files.length === 0 ? (
        <p className="rounded-xl bg-slate-50 px-5 py-4 text-sm text-slate-500">No files yet. Contracts, disclosures and receipts you upload will show up here.</p>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {files.map((f) => {
            const kind = allowedTypes[typeFor(f.fileName, f.mimeType) ?? ""]?.label ?? "File";
            const linked = docName(f.documentId);
            return (
              <li key={f.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                  <Icon name="checklist" className="h-[18px] w-[18px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{f.fileName}</p>
                  <p className="text-xs text-slate-500">
                    {kind} · {formatSize(f.sizeBytes)} · {formatDate(f.createdAt.slice(0, 10))}
                    {linked && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{linked}</span>}
                  </p>
                </div>
                <button
                  onClick={() => download(f)}
                  aria-label={`Download ${f.fileName}`}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
                >
                  Download
                </button>
                <button
                  onClick={() => remove(f)}
                  aria-label={`Remove ${f.fileName}`}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-rose-600 hover:bg-rose-50"
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
