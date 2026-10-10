"use client";

import { createContext, useCallback, useContext, useState } from "react";

// Small pop-up messages ("Draft saved", "Couldn't save: ...") that fade away.

type Toast = { id: number; text: string; kind: "success" | "error" };

const ToastContext = createContext<(text: string, kind?: Toast["kind"]) => void>(() => {});

export const useToast = () => useContext(ToastContext);

export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((text: string, kind: Toast["kind"] = "success") => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list, { id, text, kind }]);
    // Errors stay a little longer so they can be read.
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), kind === "error" ? 8000 : 3500);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6 md:items-end md:px-6"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            className={`pointer-events-auto max-w-md rounded-lg px-4 py-3 text-sm shadow-lg ${
              t.kind === "error" ? "bg-rose-600 text-white" : "bg-slate-900 text-white"
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
