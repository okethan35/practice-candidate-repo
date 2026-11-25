export interface SyncButton {
  readonly disabled: boolean;
  click(): Promise<void>;
}

export function createSyncButton(
  post: () => Promise<unknown>,
  onChange: () => void = () => {},
): SyncButton {
  let disabled = false;
  return {
    get disabled() {
      return disabled;
    },
    async click() {
      if (disabled) return;
      disabled = true;
      onChange();
      try {
        await post();
      } catch {
        // rejection is surfaced by the caller's post wrapper; never escapes here
      } finally {
        disabled = false;
        onChange();
      }
    },
  };
}
