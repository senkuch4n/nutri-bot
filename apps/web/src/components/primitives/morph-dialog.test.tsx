import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AppointmentDetailDialog } from "@/app/(panel)/turnos/appointment-detail-dialog";

// Render the real morph markup without Radix's browser-only portal and focus management.
vi.mock("@radix-ui/react-dialog", async (importOriginal) => ({
  ...await importOriginal<typeof import("@radix-ui/react-dialog")>(),
  Portal: ({ children }: { children: ReactNode }) => children,
  Content: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/app/(panel)/appointment-detail-sheet", () => ({
  AppointmentDetailBody: () => <button>Última acción del turno</button>,
}));

function renderDetail(anchored: boolean) {
  return renderToStaticMarkup(
    <AppointmentDetailDialog
      appt={{ id: "test" } as NonNullable<Parameters<typeof AppointmentDetailDialog>[0]["appt"]>}
      origin={{} as HTMLElement}
      anchored={anchored}
      tz="UTC"
      currency="ARS"
      onClose={() => {}}
      onChanged={() => {}}
      onUpdated={() => {}}
      onCancel={() => {}}
    />,
  );
}

const viewportCap = "[&amp;_[data-morph-scroll-body]]:max-h-[min(85dvh,var(--morph-anchor-available-height,85dvh))]";

describe("AppointmentDetailDialog scroll viewport", () => {
  it("caps the scrollable body by the space below the calendar anchor, not just 85dvh", () => {
    const html = renderDetail(true);
    expect(html).toContain(viewportCap);
    expect(html).toMatch(/<div[^>]*data-morph-scroll-body=""[^>]*overflow-y-auto[^>]*>\s*<button>Última acción del turno/);
  });

  it("uses a thin scrollbar with a transparent track only for calendar details", () => {
    const thin = "[&amp;_[data-morph-scroll-body]]:[scrollbar-width:thin]";
    const colors = "[&amp;_[data-morph-scroll-body]]:[scrollbar-color:rgb(0_0_0/0.2)_transparent]";
    expect(renderDetail(true)).toContain(thin);
    expect(renderDetail(true)).toContain(colors);
    expect(renderDetail(false)).not.toContain(thin);
    expect(renderDetail(false)).not.toContain(colors);
  });

  it("keeps the regular viewport cap for centered appointment details", () => {
    const html = renderDetail(false);
    expect(html).not.toContain(viewportCap);
    expect(html).toContain("max-h-[85dvh] overflow-y-auto");
  });
});
