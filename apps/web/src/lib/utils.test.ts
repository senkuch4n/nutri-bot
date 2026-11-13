import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn con tokens con nombre", () => {
  it("no confunde color con tamaño tipográfico", () => {
    expect(cn("text-foreground", "text-headline")).toBe("text-foreground text-headline");
    expect(cn("text-callout", "text-muted-foreground")).toBe("text-callout text-muted-foreground");
  });
  it("resuelve conflictos de tamaño", () => {
    expect(cn("text-sm", "text-headline")).toBe("text-headline");
    expect(cn("text-title-1", "text-body")).toBe("text-body");
  });
  it("resuelve sombras y radios", () => {
    expect(cn("shadow-sm", "shadow-float")).toBe("shadow-float");
    expect(cn("rounded-md", "rounded-xl")).toBe("rounded-xl");
  });
});
