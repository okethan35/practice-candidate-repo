import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/server";
import { createStore } from "../src/store";

function makeApp() {
  const store = createStore();
  store.placements.push({
    id: "p_b",
    tenantId: "t_beta",
    clientId: "c_beta_initech",
    workerName: "Riya",
    billRate: 50,
    payRate: 30,
    hours: 20,
    weekStart: "2026-11-02",
  });
  return createApp(store);
}

describe("GET /api/placements/:id", () => {
  it("returns 404 for another tenant's placement", async () => {
    const res = await request(makeApp()).get("/api/placements/p_b").set("x-tenant-id", "t_alpha");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "not found" });
  });

  it("returns the placement to its own tenant", async () => {
    const res = await request(makeApp()).get("/api/placements/p_b").set("x-tenant-id", "t_beta");
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("p_b");
  });

  it("returns 404 for an unknown id", async () => {
    const res = await request(makeApp()).get("/api/placements/nope").set("x-tenant-id", "t_alpha");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "not found" });
  });
});
