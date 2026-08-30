"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function AutoRefresh({
  seconds = 5,
  enabled = true,
}: {
  seconds?: number;
  enabled?: boolean;
}) {
  const router = useRouter();
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds, enabled]);
  return null;
}
