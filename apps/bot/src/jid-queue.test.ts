import { describe, expect, it } from "vitest";
import { __queueSizeForTests, runSerialByJid, runSerialByTenantAndJid } from "./jid-queue";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("runSerialByTenantAndJid", () => {
  it("procesa el mismo JID en paralelo entre consultorios, pero en FIFO dentro de cada uno", async () => {
    const events: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const first = runSerialByTenantAndJid("tenant-a", "shared-jid", async () => {
      events.push("a:first:start");
      await gate;
      events.push("a:first:end");
    });
    const second = runSerialByTenantAndJid("tenant-a", "shared-jid", async () => {
      events.push("a:second");
    });
    const other = runSerialByTenantAndJid("tenant-b", "shared-jid", async () => {
      events.push("b:first");
    });
    await Promise.resolve();
    const whileFirstWasPending = [...events];
    release();
    await Promise.all([first, second, other]);
    expect(whileFirstWasPending).toEqual(["a:first:start", "b:first"]);
    expect(events).toEqual(["a:first:start", "b:first", "a:first:end", "a:second"]);
  });
});

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
