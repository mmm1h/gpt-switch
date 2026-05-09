import type { CookieSnapshot } from "../shared/types";

export interface SwitchTransactionDeps {
  captureCurrent: () => Promise<CookieSnapshot>;
  persistRollback: (snapshot: CookieSnapshot) => Promise<void>;
  deleteManaged: () => Promise<void>;
  applyTarget: () => Promise<void>;
  refreshTabs: () => Promise<void>;
  validateTarget?: () => Promise<boolean>;
  applyRollback?: (snapshot: CookieSnapshot) => Promise<void>;
}

export async function runSwitchTransaction(
  deps: SwitchTransactionDeps
): Promise<void> {
  const rollback = await deps.captureCurrent();
  await deps.persistRollback(rollback);
  await deps.deleteManaged();
  await deps.applyTarget();
  
  if (deps.validateTarget && deps.applyRollback) {
    const isValid = await deps.validateTarget();
    if (!isValid) {
      await deps.deleteManaged();
      await deps.applyRollback(rollback);
      throw new Error("目标会话已失效，已回滚。");
    }
  }
  
  await deps.refreshTabs();
}
