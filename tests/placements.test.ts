import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/server";
import { createStore } from "../src/store";

describe("GET /api/placements", () => {
  it("requires a tenant header", async () => {
    const res = await request(createApp()).get("/api/placements");
    expect(res.status).toBe(401);
  });

  it("only lists the caller's tenant", async () => {
    const store = createStore();
    store.placements.push(
      { id: "p_a", tenantId: "t_alpha", clientId: "c_alpha_acme", workerName: "Sam", billRate: 40, payRate: 25, hours: 40, weekStart: "2026-11-02" },
      { id: "p_b", tenantId: "t_beta", clientId: "c_beta_initech", workerName: "Riya", billRate: 50, payRate: 30, hours: 20, weekStart: "2026-11-02" },
    );
    const res = await request(createApp(store)).get("/api/placements").set("x-tenant-id", "t_alpha");
    expect(res.status).toBe(200);
    expect(res.body.map((p: { id: string }) => p.id)).toEqual(["p_a"]);
  });
});
