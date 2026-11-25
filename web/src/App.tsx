import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createSyncButton } from "./syncButton";
import { getReport, getStatus, postSync } from "./api";
import { checkWeek, formatCents } from "./report";
import { createComparisonLoader, formatChange, type CompareRow } from "./compare";
import { createStatusLoader, syncMessageFor } from "./status";
import type { ReportOutcome } from "./report";

const TENANTS = ["t_alpha", "t_beta"];

export function App() {
  const [, setTick] = useState(0);
  const [tenant, setTenant] = useState(TENANTS[0]);
  const [weekInput, setWeekInput] = useState("");
  const [weekMessage, setWeekMessage] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const tenantRef = useRef(tenant);
  const weekRef = useRef("");
  const syncEpoch = useRef(0);
  tenantRef.current = tenant;

  const loader = useMemo(
    () =>
      createComparisonLoader(
        (week) =>
          getReport((u, i) => fetch(u, i), tenantRef.current, week ?? ""),
        () => setTick((n) => n + 1),
      ),
    [],
  );

  const statusLoader = useMemo(
    () =>
      createStatusLoader(
        () => getStatus((u, i) => fetch(u, i), tenantRef.current),
        () => setTick((n) => n + 1),
      ),
    [],
  );

  const reload = useCallback(() => {
    setWeekMessage(null);
    void loader.load(weekRef.current);
  }, [loader]);

  const button = useMemo(
    () =>
      createSyncButton(
        async () => {
          const epoch = ++syncEpoch.current;
          setSyncMessage(null);
          let outcome: ReportOutcome;
          try {
            const r = await postSync((u, i) => fetch(u, i), tenantRef.current);
            outcome = { kind: "response", status: r.status, body: r.body };
          } catch (error) {
            outcome = { kind: "failed", error };
          }
          // a tenant change or a newer click owns the message now
          if (epoch === syncEpoch.current) setSyncMessage(syncMessageFor(outcome));
          // rule 64/68/71: reload for the tenant picked when the response arrives
          void statusLoader.load();
          reload();
        },
        () => setTick((n) => n + 1),
      ),
    [statusLoader, reload],
  );

  useEffect(() => {
    void statusLoader.load();
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant]);

  const changeTenant = (next: string) => {
    // rule 81: clear everything from the previous tenant before the new requests
    syncEpoch.current++;
    statusLoader.reset();
    loader.reset();
    setSyncMessage(null);
    setWeekMessage(null);
    setTenant(next);
  };

  const apply = () => {
    const check = checkWeek(weekInput);
    if (check.kind === "invalid") {
      setWeekMessage(check.message);
      return;
    }
    weekRef.current = check.kind === "valid" ? check.week : "";
    reload();
  };

  const view = loader.view;
  const status = statusLoader.view;
  const showChange = weekRef.current !== "";

  return (
    <main className="page">
      <div className="controls">
        <label>
          Tenant{" "}
          <select value={tenant} onChange={(e) => changeTenant(e.target.value)}>
            {TENANTS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label>
          Week{" "}
          <input
            value={weekInput}
            onChange={(e) => setWeekInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") apply();
            }}
          />
        </label>
        <button onClick={apply}>Apply</button>
        <button disabled={button.disabled} onClick={() => void button.click()}>
          Sync now
        </button>
        {syncMessage ? <span className="error">{syncMessage}</span> : null}
      </div>
      <div className="status">
        {status === null ? null : status.kind === "status" ? (
          <>
            <p className="last-synced">{status.lastSynced}</p>
            {status.counts ? <p className="secondary">{status.counts}</p> : null}
          </>
        ) : (
          <p className={status.kind === "error" ? "error" : "secondary"}>{status.message}</p>
        )}
      </div>
      {weekMessage ? (
        <p>{weekMessage}</p>
      ) : view === null ? null : view.kind === "table" ? (
        <>
          {showChange && view.note ? <p className="error">{view.note}</p> : null}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Client</th>
                  <th className="money">Revenue</th>
                  <th className="money">Pay</th>
                  <th className="money">Burden</th>
                  <th className="money">Gross profit</th>
                  {showChange ? <th className="money">vs prior week</th> : null}
                </tr>
              </thead>
              <tbody>
                {view.rows.map((r) => (
                  <tr key={r.clientId}>
                    <td>{r.clientName}</td>
                    <td className="money">{formatCents(r.revenueCents)}</td>
                    <td className="money">{formatCents(r.payCents)}</td>
                    <td className="money">{formatCents(r.burdenCents)}</td>
                    <td className="money">{formatCents(r.grossProfitCents)}</td>
                    {showChange ? (
                      <td className="money">
                        {(r as CompareRow).change == null ? "—" : formatChange((r as CompareRow).change as number)}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className={view.kind === "error" ? "error" : undefined}>{view.message}</p>
      )}
    </main>
  );
}
