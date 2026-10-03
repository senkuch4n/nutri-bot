import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = { title: "Demo de diseño — portal", robots: { index: false, follow: false } };

/** Demo del shell del portal (HU-017a). Se completa en la fase 6. Solo en desarrollo. */
export default function DevDisenoPortalPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main data-apple-preview className="theme-portal grid min-h-[100dvh] place-items-center bg-grouped p-6">
      <p className="text-body text-muted-foreground">Demo del portal: se completa en la fase 6.</p>
    </main>
  );
}
