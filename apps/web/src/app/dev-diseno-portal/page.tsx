import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PortalDemo } from "./portal-demo";

export const metadata: Metadata = { title: "Demo de diseño — portal", robots: { index: false, follow: false } };

/** Demo del shell del portal con datos falsos (HU-017a §13). Solo en desarrollo; no lee la base. */
export default function DevDisenoPortalPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <PortalDemo />;
}
