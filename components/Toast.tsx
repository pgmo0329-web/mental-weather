"use client";

import { toastStore, useStore } from "@/lib/data";

export default function Toast() {
  const toast = useStore(toastStore);
  if (!toast) return null;
  return (
    <div
      key={toast.id}
      role="status"
      className="fixed inset-x-4 bottom-24 z-40 mx-auto max-w-md rounded-2xl bg-text px-4 py-3 text-center text-sm text-white shadow-lg md:bottom-8"
    >
      {toast.text}
    </div>
  );
}
