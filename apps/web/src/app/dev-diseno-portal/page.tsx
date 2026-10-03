import { notFound } from "next/navigation";
import { PortalDemo } from "./portal-demo";

/** Demo del shell del portal con datos falsos (HU-017a §13). Solo en desarrollo; no lee la base. */
export default function DevDisenoPortalPage() {
  if (process.env.NODE_ENV === "production") notFound();
  // Sin `export const metadata` (ver dev-diseno/page.tsx): React 19 sube el <meta> al <head>.
  return (
    <>
      <meta name="robots" content="noindex, nofollow" />
      <PortalDemo />
    </>
  );
}
