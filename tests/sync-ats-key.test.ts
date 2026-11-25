import request from "supertest";
import { afterEach, expect, it } from "vitest";
import { createApp } from "../src/server";

const saved = process.env.ATS_API_KEY;
afterEach(() => {
  if (saved === undefined) delete process.env.ATS_API_KEY;
  else process.env.ATS_API_KEY = saved;
});

it("502s when ATS_API_KEY is unset", async () => {
  delete process.env.ATS_API_KEY;
  const r = await request(createApp()).post("/api/sync").set("x-tenant-id", "t_alpha");
  expect(r.status).toBe(502);
  expect(r.body).toEqual({ error: "ATS request failed: ATS auth failed: ATS_API_KEY is not set" });
});
