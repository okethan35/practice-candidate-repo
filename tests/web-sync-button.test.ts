import { describe, expect, it, vi } from "vitest";
import { createSyncButton } from "../web/src/syncButton";

function controlled() {
  let resolve!: (v: { status: number }) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<{ status: number }>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  const post = vi.fn(() => promise);
  return { post, resolve, reject };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("sync button (rule 32)", () => {
  it("is enabled before any click", () => {
    const { post } = controlled();
    expect(createSyncButton(post).disabled).toBe(false);
  });

  it("is disabled while post is pending", () => {
    const { post } = controlled();
    const b = createSyncButton(post);
    b.click();
    expect(b.disabled).toBe(true);
  });

  it("calls post once for repeated clicks while pending", () => {
    const { post } = controlled();
    const b = createSyncButton(post);
    b.click();
    b.click();
    b.click();
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("re-enables after a 200 and allows a new post", async () => {
    const c = controlled();
    const b = createSyncButton(c.post);
    b.click();
    c.resolve({ status: 200 });
    await flush();
    expect(b.disabled).toBe(false);
    b.click();
    expect(c.post).toHaveBeenCalledTimes(2);
  });

  it.each([409, 502])("re-enables after a %i", async (status) => {
    const c = controlled();
    const b = createSyncButton(c.post);
    b.click();
    c.resolve({ status });
    await flush();
    expect(b.disabled).toBe(false);
  });

  it("re-enables after a rejection without an unhandled error", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    const c = controlled();
    const b = createSyncButton(c.post);
    b.click();
    c.reject(new Error("network"));
    await flush();
    process.off("unhandledRejection", unhandled);
    expect(b.disabled).toBe(false);
    expect(unhandled).not.toHaveBeenCalled();
  });
});
