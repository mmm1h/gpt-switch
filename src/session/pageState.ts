import { CHATGPT_HOME_URL, CHATGPT_TAB_PATTERNS } from "../shared/constants";

export async function refreshChatGptTabs(forceHome = true): Promise<void> {
  const tabs = await queryTabs({ url: CHATGPT_TAB_PATTERNS });

  if (tabs.length === 0) {
    await createTab({ url: CHATGPT_HOME_URL, active: true });
    return;
  }

  for (const tab of tabs) {
    if (typeof tab.id !== "number") {
      continue;
    }

    await clearTabState(tab.id);

    if (forceHome) {
      await updateTab(tab.id, { url: CHATGPT_HOME_URL, active: true });
    } else {
      await reloadTab(tab.id);
    }
  }
}

async function clearTabState(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: clearPageStateInPage
    });
  } catch {
    // The tab may be on a restricted page or mid-navigation. Refresh still helps.
  }
}

function clearPageStateInPage(): void {
  try {
    localStorage.clear();
  } catch {
    // Ignore page storage failures.
  }

  try {
    sessionStorage.clear();
  } catch {
    // Ignore page storage failures.
  }

  const maybeIndexedDb = indexedDB as IDBFactory & {
    databases?: () => Promise<Array<{ name?: string }>>;
  };

  if (typeof maybeIndexedDb.databases === "function") {
    void maybeIndexedDb.databases().then((databases) => {
      for (const database of databases) {
        if (database.name) {
          indexedDB.deleteDatabase(database.name);
        }
      }
    });
  }
}

function queryTabs(queryInfo: chrome.tabs.QueryInfo): Promise<chrome.tabs.Tab[]> {
  return new Promise((resolve, reject) => {
    chrome.tabs.query(queryInfo, (tabs) => {
      const error = chrome.runtime.lastError;

      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve(tabs);
    });
  });
}

function updateTab(
  tabId: number,
  updateProperties: chrome.tabs.UpdateProperties
): Promise<chrome.tabs.Tab> {
  return new Promise((resolve, reject) => {
    chrome.tabs.update(tabId, updateProperties, (tab) => {
      const error = chrome.runtime.lastError;

      if (error) {
        reject(new Error(error.message));
        return;
      }

      if (!tab) {
        reject(new Error("Chrome did not return the updated tab"));
        return;
      }

      resolve(tab);
    });
  });
}

function reloadTab(tabId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.tabs.reload(tabId, {}, () => {
      const error = chrome.runtime.lastError;

      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve();
    });
  });
}

function createTab(createProperties: chrome.tabs.CreateProperties): Promise<chrome.tabs.Tab> {
  return new Promise((resolve, reject) => {
    chrome.tabs.create(createProperties, (tab) => {
      const error = chrome.runtime.lastError;

      if (error) {
        reject(new Error(error.message));
        return;
      }

      if (!tab) {
        reject(new Error("Chrome did not return the created tab"));
        return;
      }

      resolve(tab);
    });
  });
}
