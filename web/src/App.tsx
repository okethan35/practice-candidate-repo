import { useEffect, useMemo, useRef, useState } from "react";
import { createSyncButton } from "./syncButton";
import { getReport, postSync } from "./api";
import { checkWeek, createReportLoader, formatCents, type ReportView } from "./report";

const TENANTS = ["t_alpha", "t_beta"];

export function App() {
  const [, setTick] = useState(0);
  const [tenant, setTenant] = useState(TENANTS[0]);
  const [weekInput, setWeekInput] = useState("");
  const [weekMessage, setWeekMessage] = useState<string | null>(null);
  const tenantRef = useRef(tenant);
  const weekRef = useRef("");
  tenantRef.current = tenant;

  const loader = useMemo(
    () =>
      createReportLoader(
        (week) =>
          getReport((u, i) => fetch(u, i), tenantRef.current, week ?? ""),
        () => setTick((n) => n + 1),
      ),
    [],
  );

  const reload = () => void loader.load(weekRef.current);

  const button = useMemo(
    () =>
      createSyncButton(
        async () => {
          try {
            return await postSync((u, i) => fetch(u, i), tenantRef.current);
          } finally {
            // rule 64/68: reload for the tenant picked when the response arrives
            void loader.load(weekRef.current);
          }
        },
        () => setTick((n) => n + 1),
      ),
    [loader],
  );

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant]);

  const apply = () => {
    const check = checkWeek(weekInput);
    if (check.kind === "invalid") {
      setWeekMessage(check.message);
      return;
    }
    setWeekMessage(null);
    weekRef.current = check.kind === "valid" ? check.week : "";
    reload();
  };

  const view: ReportView | null = loader.view;

  return (
    <div>
      <label>
        Tenant{" "}
        <select value={tenant} onChange={(e) => setTenant(e.target.value)}>
          {TENANTS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>{" "}
      <label>
        Week{" "}
        <input
          value={weekInput}
          onChange={(e) => setWeekInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") apply();
          }}
        />
      </label>{" "}
      <button onClick={apply}>Apply</button>{" "}
      <button disabled={button.disabled} onClick={() => void button.click()}>
        Sync now
      </button>
      {weekMessage ? (
        <p>{weekMessage}</p>
      ) : view === null ? null : view.kind === "table" ? (
        <table>
          <thead>
            <tr>
              <th>Client</th>
              <th>Revenue</th>
              <th>Pay</th>
              <th>Burden</th>
              <th>Gross profit</th>
            </tr>
          </thead>
          <tbody>
            {view.rows.map((r) => (
              <tr key={r.clientId}>
                <td>{r.clientName}</td>
                <td>{formatCents(r.revenueCents)}</td>
                <td>{formatCents(r.payCents)}</td>
                <td>{formatCents(r.burdenCents)}</td>
                <td>{formatCents(r.grossProfitCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>{view.message}</p>
      )}
    </div>
  );
}
