"use client";

import { useTransition } from "react";
import { retryMessageAction } from "./actions";

export function RetryButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      onClick={() => start(() => retryMessageAction(id))}
      disabled={pending}
      className="text-sm font-medium text-brand hover:underline disabled:opacity-50"
    >
      {pending ? "…" : "Reintentar"}
    </button>
  );
}
