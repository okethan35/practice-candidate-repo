import type { NextFunction, Request, Response } from "express";
import type { Store } from "./store";

declare global {
  namespace Express {
    interface Request {
      tenantId?: string;
    }
  }
}

// Fake auth: the tenant comes straight from a header.
export function requireTenant(store: Store) {
  return (req: Request, res: Response, next: NextFunction) => {
    const id = req.header("x-tenant-id");
    if (!id) return res.status(401).json({ error: "missing x-tenant-id" });
    if (!store.tenants.some((t) => t.id === id)) return res.status(403).json({ error: "unknown tenant" });
    req.tenantId = id;
    next();
  };
}
