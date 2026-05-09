import type { CookieSnapshot } from "../shared/types";

export interface SwitchTransactionDeps {
  captureCurrent: () => Promise<CookieSnapshot>;
  persistRollback: (snapshot: CookieSnapshot) => Promise<void>;
  deleteManaged: () => Promise<void>;
  applyTarget: () => Promise<void>;
  refreshTabs: () => Promise<void>;
}

export async function runSwitchTransaction(
  deps: SwitchTransactionDeps
): Promise<void> {
  const rollback = await deps.captureCurrent();
  await deps.persistRollback(rollback);
  await deps.deleteManaged();
  await deps.applyTarget();
  await deps.refreshTabs();
}
