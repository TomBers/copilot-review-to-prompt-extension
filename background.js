/* background.js
 * MV3 service worker: Toggle/open the on-page Copilot panel when the extension action is clicked.
 * - Tries to toggle first (if supported by the content script), then falls back to opening.
 * - If the content script hasn't populated yet, triggers a refresh and then opens.
 */

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Send a message to a tab, swallow errors, and resolve with the response or null.
function sendMessageSafe(tabId, message) {
  return new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(tabId, message, (resp) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(resp ?? {});
      });
    } catch {
      resolve(null);
    }
  });
}

async function toggleOrOpenPanel(tabId) {
  // 1) Try toggle
  const toggleResp = await sendMessageSafe(tabId, { type: "CRTP_TOGGLE_PANEL" });
  if (toggleResp) return true;

  // 2) Try open
  const openResp = await sendMessageSafe(tabId, { type: "CRTP_OPEN_PANEL" });
  if (openResp) return true;

  // 3) Try refresh then open
  const refreshResp = await sendMessageSafe(tabId, { type: "CRTP_REFRESH" });
  if (refreshResp) {
    await sleep(200);
    const openAfterRefresh = await sendMessageSafe(tabId, { type: "CRTP_OPEN_PANEL" });
    if (openAfterRefresh) return true;
  }

  return false;
}

async function handleActionClicked(clickedTab) {
  let tabId = clickedTab && clickedTab.id ? clickedTab.id : null;

  // Fallback: find active tab in current window if tab info isn't provided
  if (!tabId && chrome.tabs && chrome.tabs.query) {
    try {
      const tabs = await new Promise((resolve) =>
        chrome.tabs.query({ active: true, currentWindow: true }, resolve),
      );
      if (tabs && tabs[0]) tabId = tabs[0].id;
    } catch {
      // ignore
    }
  }

  if (!tabId) return;

  await toggleOrOpenPanel(tabId);
}

// Primary entry: browser action click
if (chrome.action && chrome.action.onClicked) {
  chrome.action.onClicked.addListener((tab) => {
    // Fire and forget; service worker can go idle after async completes
    handleActionClicked(tab);
  });
}
