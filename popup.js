document.addEventListener("DOMContentLoaded", () => {
  const root = document.body;
  root.innerHTML = `
    <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; padding: 12px; width: 320px;">
      <h2 style="margin: 0 0 8px; font-size: 16px;">Copilot Review to Prompt</h2>
      <div id="status" style="font-size: 12px; color: #57606a; margin-bottom: 8px;">Loading…</div>
      <div id="counts" style="display: none; font-size: 13px; margin-bottom: 8px;">
        <div>Found: <strong id="found">0</strong></div>
        <div>Selected: <strong id="selected">0</strong></div>
      </div>
      <div id="actions" style="display: flex; gap: 8px;">
        <button id="init" style="display: none;">Initialize</button>
        <button id="refresh" style="display: none;">Refresh</button>
        <button id="copy" style="display: none;">Copy Selected</button>
      </div>
    </div>
  `;

  let lastSuggestions = [];
  let lastSelectedIds = [];

  function getActiveTab(cb) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) =>
      cb(tabs[0]),
    );
  }

  function updateUI(info) {
    const status = document.getElementById("status");
    const counts = document.getElementById("counts");
    const foundEl = document.getElementById("found");
    const selectedEl = document.getElementById("selected");
    const initBtn = document.getElementById("init");
    const refreshBtn = document.getElementById("refresh");
    const copyBtn = document.getElementById("copy");

    if (!info || !info.isPR) {
      status.textContent = "Open a GitHub PR page to use this extension.";
      counts.style.display = "none";
      initBtn.style.display = "none";
      refreshBtn.style.display = "none";
      copyBtn.style.display = "none";
      return;
    }

    counts.style.display = "block";
    foundEl.textContent = info.found;
    selectedEl.textContent = info.selected;
    status.textContent = info.hasCRTP
      ? ""
      : "Click Initialize to load the page helper.";

    initBtn.style.display = info.hasCRTP ? "none" : "inline-block";
    refreshBtn.style.display = "inline-block";
    copyBtn.style.display = "inline-block";
    copyBtn.disabled = info.found === 0;
  }

  function queryInfo(tabId, cb) {
    chrome.tabs.sendMessage(tabId, { type: "CRTP_QUERY" }, (info) => {
      if (chrome.runtime.lastError || !info) {
        // Fallback: Try to inject the content script dynamically, then query again
        if (chrome.scripting && chrome.scripting.executeScript) {
          chrome.scripting.executeScript(
            { target: { tabId }, files: ["content.js"] },
            () => {
              chrome.tabs.sendMessage(
                tabId,
                { type: "CRTP_QUERY" },
                (info2) => {
                  if (chrome.runtime.lastError || !info2) {
                    lastSuggestions = [];
                    lastSelectedIds = [];
                    updateUI({ isPR: false });
                    cb && cb(null);
                    return;
                  }
                  lastSuggestions = info2.suggestions || [];
                  lastSelectedIds = info2.selectedIds || [];
                  updateUI(info2);
                  cb && cb(info2);
                },
              );
            },
          );
        } else {
          lastSuggestions = [];
          lastSelectedIds = [];
          updateUI({ isPR: false });
          cb && cb(null);
        }
        return;
      }
      lastSuggestions = info.suggestions || [];
      lastSelectedIds = info.selectedIds || [];
      updateUI(info);
      cb && cb(info);
    });
  }

  function injectContentScript(tabId, cb) {
    // Try to refresh first if content script is already present
    chrome.tabs.sendMessage(tabId, { type: "CRTP_REFRESH" }, () => {
      if (chrome.runtime.lastError) {
        // Fallback: dynamically inject the content script
        if (chrome.scripting && chrome.scripting.executeScript) {
          chrome.scripting.executeScript(
            { target: { tabId }, files: ["content.js"] },
            () => cb && cb(),
          );
        } else {
          cb && cb();
        }
      } else {
        cb && cb();
      }
    });
  }

  function buildPrompt(prUrl, items) {
    const header = [
      "Task: Apply the following review suggestions from GitHub Copilot to the codebase in this PR.",
      prUrl ? `PR: ${prUrl}` : null,
      "Instructions:",
      "- For each item, implement the change described.",
      "- If multiple files are impacted, update all relevant locations.",
      "- Preserve existing behavior unless a change is explicitly requested.",
      "",
    ]
      .filter(Boolean)
      .join("\n");

    const body = items
      .map((s, idx) => {
        return [
          `#${idx + 1} ${s.summary}`,
          s.text !== s.summary ? `Details:\n${s.text}` : null,
          s.sourceUrl ? `Source: ${s.sourceUrl}` : null,
          "",
        ]
          .filter(Boolean)
          .join("\n");
      })
      .join("\n");

    return header + "\n" + body;
  }

  function copySelectedPrompt(tab) {
    const ids = lastSelectedIds.slice();
    // If nothing selected, default to copying all found suggestions
    if (ids.length === 0) {
      if (lastSuggestions.length > 0) {
        const prompt = buildPrompt(tab && tab.url, lastSuggestions);
        navigator.clipboard
          .writeText(prompt)
          .then(() => {
            document.getElementById("status").textContent =
              `Copied ${lastSuggestions.length} suggestion(s).`;
          })
          .catch((err) => {
            document.getElementById("status").textContent =
              "Copy failed: " +
              (err && err.message ? err.message : "unknown error");
          });
      } else {
        document.getElementById("status").textContent =
          "No suggestions available to copy.";
      }
      return;
    }
    chrome.tabs.sendMessage(
      tab.id,
      { type: "CRTP_BUILD_PROMPT", ids },
      (resp) => {
        if (chrome.runtime.lastError || !resp || !resp.prompt) {
          document.getElementById("status").textContent =
            "Copy failed: unable to build prompt.";
          return;
        }
        navigator.clipboard
          .writeText(resp.prompt)
          .then(() => {
            document.getElementById("status").textContent =
              `Copied ${ids.length} suggestion(s).`;
          })
          .catch((err) => {
            document.getElementById("status").textContent =
              "Copy failed: " +
              (err && err.message ? err.message : "unknown error");
          });
      },
    );
  }

  getActiveTab((tab) => {
    if (!tab) return;
    queryInfo(tab.id, () => {
      document.getElementById("init").addEventListener("click", () => {
        injectContentScript(tab.id, () => {
          chrome.tabs.sendMessage(tab.id, { type: "CRTP_OPEN_PANEL" }, () => {
            queryInfo(tab.id);
          });
        });
      });
      document
        .getElementById("refresh")
        .addEventListener("click", () => queryInfo(tab.id));
      document
        .getElementById("copy")
        .addEventListener("click", () => copySelectedPrompt(tab));
    });
  });
});
