import { describe, expect, it } from "vitest";
import { __queueSizeForTests, runSerialByJid } from "./jid-queue";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("runSerialByJid", () => {
  it("mismo jid: FIFO y la 2.ª empieza cuando termina la 1.ª", async () => {
    const events: string[] = [];
    const a = runSerialByJid("j1", async () => {
      events.push("a:start");
      await sleep(40);
      events.push("a:end");
      return "a";
    });
    const b = runSerialByJid("j1", async () => {
      events.push("b:start");
      await sleep(5);
      events.push("b:end");
      return "b";
    });
    expect(await Promise.all([a, b])).toEqual(["a", "b"]);
    expect(events).toEqual(["a:start", "a:end", "b:start", "b:end"]);
  });

  it("jids distintos corren en paralelo", async () => {
    const events: string[] = [];
    const a = runSerialByJid("x1", async () => {
      events.push("x1:start");
      await sleep(40);
      events.push("x1:end");
    });
    const b = runSerialByJid("x2", async () => {
      events.push("x2:start");
      await sleep(5);
      events.push("x2:end");
    });
    await Promise.all([a, b]);
    expect(events.indexOf("x2:start")).toBeLessThan(events.indexOf("x1:end"));
  });

  it("un error rechaza su promesa pero la siguiente corre igual", async () => {
    const a = runSerialByJid("e1", async () => {
      throw new Error("boom");
    });
    const b = runSerialByJid("e1", async () => "ok");
    await expect(a).rejects.toThrow("boom");
    await expect(b).resolves.toBe("ok");
  });

  it("al vaciarse no conserva el jid", async () => {
    await runSerialByJid("v1", async () => sleep(5));
    await sleep(0);
    expect(__queueSizeForTests()).toBe(0);
  });
});
