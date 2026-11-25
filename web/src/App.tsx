import { useMemo, useState } from "react";
import { createSyncButton } from "./syncButton";

export function App() {
  const [, setTick] = useState(0);
  const [text, setText] = useState("");

  const button = useMemo(
    () =>
      createSyncButton(async () => {
        try {
          const res = await fetch("/api/sync", {
            method: "POST",
            headers: { "x-tenant-id": "t_alpha" },
          });
          setText(`${res.status} ${await res.text()}`);
          return res;
        } catch (err) {
          setText(`Error: ${err instanceof Error ? err.message : String(err)}`);
          throw err;
        }
      }, () => setTick((n) => n + 1)),
    [],
  );

  return (
    <div>
      <button disabled={button.disabled} onClick={() => void button.click()}>
        Sync now
      </button>
      <pre>{text}</pre>
    </div>
  );
}
