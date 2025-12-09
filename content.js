/**
 * Content script to extract GitHub Copilot review suggestions on PR pages,
 * present them in a selectable list, and copy a structured prompt to clipboard.
 *
 * Behavior:
 * - Detects and parses review comments in turbo-frame elements with id starting with "review-thread-or-comment-id-".
 * - Attempts to filter to Copilot-authored comments (best-effort).
 * - Extracts suggestions from bullet lists, enumerated lists, and lines prefixed with patterns like "Suggestion:", "Fix:", "- ", "1. ".
 * - Injects a floating action button and an overlay panel (Shadow DOM) with checkboxes for each suggestion.
 * - Allows selecting/unselecting and copying selected suggestions into a single structured output for an LLM.
 * - Persists selection state per-PR in localStorage.
 */

(() => {
  "use strict";

  // Only run on GitHub PR pages
  const isPRPage = () =>
    /^\/[^/]+\/[^/]+\/pull\/\d+(?:\/.*)?$/.test(location.pathname);

  if (!isPRPage()) return;

  // --------------------- Utilities ---------------------

  const debounce = (fn, delay = 250) => {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), delay);
    };
  };

  const hashString = (str) => {
    // Simple 32-bit FNV-1a hash
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
    }
    // Convert to unsigned and base36 for compactness
    return (h >>> 0).toString(36);
  };

  const safeText = (el) => (el?.textContent || "").trim();

  const currentPRKey = () =>
    `copilot-review-to-prompt:${location.origin}${location.pathname}`;

  const storage = {
    getDeselectedSet() {
      try {
        const raw = localStorage.getItem(currentPRKey() + ":deselected");
        if (!raw) return new Set();
        const arr = JSON.parse(raw);
        return new Set(Array.isArray(arr) ? arr : []);
      } catch {
        return new Set();
      }
    },
    saveDeselectedSet(set) {
      try {
        localStorage.setItem(
          currentPRKey() + ":deselected",
          JSON.stringify(Array.from(set)),
        );
      } catch {
        // ignore quota errors
      }
    },
    getIgnoredSet() {
      try {
        const raw = localStorage.getItem(currentPRKey() + ":ignored");
        if (!raw) return new Set();
        const arr = JSON.parse(raw);
        return new Set(Array.isArray(arr) ? arr : []);
      } catch {
        return new Set();
      }
    },
    saveIgnoredSet(set) {
      try {
        localStorage.setItem(
          currentPRKey() + ":ignored",
          JSON.stringify(Array.from(set)),
        );
      } catch {
        // ignore quota errors
      }
    },
  };

  // --------------------- Extraction ---------------------
  //
  // Enhanced helpers to extract file path, line numbers, review text (excluding code),
  // and suggested change content from GitHub PR review threads and comments.
  const findFilePathInFrame = (frame) => {
    // Priority 0: user specific selector
    const specificFileLink = frame.querySelector(
      "details-collapsible summary a",
    );
    if (specificFileLink) {
      return safeText(specificFileLink);
    }

    // Priority 1: elements with data-path attribute
    const dataPathEl = frame.querySelector("[data-path]");
    if (dataPathEl?.getAttribute("data-path")) {
      return dataPathEl.getAttribute("data-path").trim();
    }
    // Priority 2: anchors that look like file links in the thread header
    const fileLink = frame.querySelector(
      "a.js-file-link, a.Link--primary, a.Link--secondary",
    );
    const candidate = safeText(fileLink);
    if (candidate && (candidate.includes("/") || /\.\w+$/.test(candidate))) {
      return candidate;
    }
    // Priority 3: look for elements that contain a path-like string
    const anyPathy = frame.querySelector('[title*="/"], [aria-label*="/"]');
    const pathy = safeText(anyPathy);
    if (pathy && pathy.includes("/")) return pathy;
    return null;
  };

  const findLineRangeInFrame = (frame) => {
    const nums = new Set();

    // User specific selector for line text (e.g. "Lines 42-45")
    const specificLineDiv = frame.querySelector(
      "details-collapsible details > div > div:first-child",
    );
    if (specificLineDiv) {
      const text = safeText(specificLineDiv);
      const m = text.match(/Lines?\s+(\d+)(?:-(\d+))?/i);
      if (m) {
        const start = parseInt(m[1], 10);
        const end = m[2] ? parseInt(m[2], 10) : start;
        if (!Number.isNaN(start)) nums.add(start);
        if (!Number.isNaN(end)) nums.add(end);
      }
    }

    // Common patterns in GitHub's DOM
    frame.querySelectorAll("[data-line-number]").forEach((el) => {
      const n = parseInt(el.getAttribute("data-line-number"), 10);
      if (!Number.isNaN(n)) nums.add(n);
    });

    frame.querySelectorAll(".blob-num").forEach((el) => {
      const n = parseInt(safeText(el), 10);
      if (!Number.isNaN(n)) nums.add(n);
    });

    // Look for anchors containing #L123 or #R123
    frame.querySelectorAll('a[href*="#L"], a[href*="#R"]').forEach((a) => {
      const href = a.getAttribute("href") || "";
      const m = href.match(/#(?:L|R)(\d+)/);
      if (m) {
        const n = parseInt(m[1], 10);
        if (!Number.isNaN(n)) nums.add(n);
      }
    });

    if (nums.size === 0) return { lineStart: null, lineEnd: null };

    const arr = Array.from(nums.values()).sort((a, b) => a - b);
    return { lineStart: arr[0], lineEnd: arr[arr.length - 1] };
  };

  const findCodeMentionedInFrame = (frame) => {
    const table = frame.querySelector(
      "details-collapsible > details-toggle > details > div > div.blob-wrapper.border-bottom > table",
    );
    if (table) {
      const codeLines = [];
      table.querySelectorAll("tr").forEach((row) => {
        const codeCell = row.querySelector(".blob-code-inner");
        if (codeCell) {
          codeLines.push(codeCell.innerText);
        }
      });
      if (codeLines.length > 0) return codeLines.join("\n");

      return safeText(table);
    }
    return null;
  };

  const extractReviewTextOnly = (commentRoot) => {
    // User specific selector for comment content
    const taskLists = commentRoot.querySelector(
      "div:nth-child(2) > div.edit-comment-hide > task-lists",
    );
    const body =
      taskLists || commentRoot.querySelector(".js-comment-body, .comment-body");

    if (!body) return null;
    const clone = body.cloneNode(true);
    // Remove code and complex blocks to isolate prose review text
    clone
      .querySelectorAll(
        "pre, code, table, details, button, .btn, .d-none, .js-suggested-changes-container",
      )
      .forEach((n) => n.remove());
    const text = safeText(clone)
      .replace(/Suggested change/g, "")
      .replace(/Suggestion applied/g, "")
      .replace(/Commit suggestion/g, "")
      .trim();
    return text || null;
  };

  const extractPrimarySuggestedChange = (commentRoot) => {
    const body = commentRoot.querySelector(".js-comment-body, .comment-body");
    if (!body) return null;

    // Prefer previously detected change blocks
    const changeBlocks = extractSuggestedChangeBlocks(body);
    if (changeBlocks.length > 0) {
      // return the first block as primary suggestion
      return changeBlocks[0];
    }

    // Fallback: first <pre> content inside the comment
    const pre = body.querySelector("pre");
    const preText = safeText(pre);
    if (preText) return preText;

    // Fallback: any code block text (may not be a diff)
    const code = body.querySelector("code");
    const codeText = safeText(code);
    if (codeText) return codeText;

    return null;
  };

  /**
   * Try to decide whether the comment is authored by GitHub Copilot.
   * Best effort: look for author text, bot badges, or content hints.
   */
  const isCopilotAuthor = (commentRoot) => {
    try {
      // Author link commonly has class "author"
      const authorLink = commentRoot.querySelector("a.author");
      const authorText = safeText(authorLink).toLowerCase();
      if (authorText.includes("copilot")) return true;
      if (/github-?copilot/.test(authorLink?.getAttribute("href") || ""))
        return true;
      // Look for bot badge or aria labels
      const botBadge = commentRoot.querySelector(
        '[aria-label*="bot"], .Label--success, .Label[data-view-component="true"]',
      );
      const botText = safeText(botBadge).toLowerCase();
      if (botText.includes("bot") && authorText.includes("copilot"))
        return true;

      // Content heuristic: mentions Copilot analysis
      const body = commentRoot.querySelector(".js-comment-body, .comment-body");
      const bodyText = safeText(body).toLowerCase();
      if (/\bcopilot\b/.test(bodyText) || /ai\s+review/.test(bodyText))
        return true;
    } catch {
      // fallthrough
    }
    return false;
  };

  const getAnchorUrlForComment = (commentRoot) => {
    // Try to get a permalink from timestamp or header "3 days ago" link
    const timestampLink = commentRoot
      .querySelector("relative-time, time-ago, time")
      ?.closest("a");
    const headerLink = commentRoot.querySelector(
      'a.Link--secondary[href*="#"]',
    );
    const link = timestampLink || headerLink;
    const href = link?.href;
    return href || location.href;
  };

  const extractListItems = (container) => {
    const items = [];
    container.querySelectorAll("ul li, ol li").forEach((li) => {
      const txt = safeText(li);
      if (txt) items.push(txt);
    });
    return items;
  };

  const extractPatternLines = (container) => {
    // Lines that look like suggestions in free text
    const text = safeText(container);
    if (!text) return [];
    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const pattern =
      /^(-|\*|\d+\.)\s+(.+)$|^(suggestion|fix|improve|change|refactor|rename|remove|add|update)[:\-]\s*(.+)$/i;
    const items = [];
    for (const line of lines) {
      const m = line.match(pattern);
      if (m) {
        const candidate = m[2] || m[4] || line;
        const cleaned = candidate.replace(/^["'\s]+|["'\s]+$/g, "");
        if (cleaned) items.push(cleaned);
      }
    }
    return items;
  };

  const extractSuggestedChangeBlocks = (container) => {
    // Best effort: look for "Suggested change" content across details, Copilot table blobs, and pre/code diffs
    const items = [];

    // 1) Native "Suggested change" details blocks
    container.querySelectorAll("details").forEach((det) => {
      const summaryText = safeText(det.querySelector("summary")).toLowerCase();
      if (
        summaryText.includes("suggested change") ||
        summaryText.includes("suggestion")
      ) {
        const code = safeText(det.querySelector("pre, code"));
        if (code) items.push(`Suggested change:\n${code}`);
      }
    });

    // 2) GitHub Copilot "Suggested change" table blobs -> convert to unified diff-like lines
    const tables = container.querySelectorAll(
      ".js-suggested-changes-blob table, .js-suggested-changes-blob .d-table",
    );
    tables.forEach((table) => {
      const lines = [];
      table.querySelectorAll("tr").forEach((tr) => {
        const hasDeletion = !!tr.querySelector(
          ".blob-num-deletion, .blob-code-deletion, .js-blob-code-deletion, .blob-code-marker-deletion",
        );
        const hasAddition = !!tr.querySelector(
          ".blob-num-addition, .blob-code-addition, .js-blob-code-addition, .blob-code-marker-addition",
        );
        // Prefer the code cell; fall back to the last cell in the row
        let cell =
          tr.querySelector("td.blob-code-inner") ||
          tr.querySelector("td .blob-code-inner") ||
          tr.querySelector("td.blob-code") ||
          tr.querySelector("td:last-child");
        if (!cell) {
          const tds = tr.querySelectorAll("td");
          cell = tds[tds.length - 1];
        }
        const txt = safeText(cell);
        if (!txt) return;
        if (hasDeletion) {
          lines.push("- " + txt);
        } else if (hasAddition) {
          lines.push("+ " + txt);
        } else {
          lines.push("  " + txt);
        }
      });
      const diff = lines.join("\n").trim();
      if (diff) {
        items.push(`Suggested diff:\n${diff}`);
      }
    });

    // 3) Fallback: preformatted diffs found directly in the comment
    container.querySelectorAll("pre").forEach((pre) => {
      const code = safeText(pre);
      if (code && /^(?:\+|\-|\s|@@|diff)/m.test(code)) {
        items.push(`Suggested diff:\n${code}`);
      }
    });

    return items;
  };

  const dedupe = (arr) => {
    const seen = new Set();
    const out = [];
    for (const s of arr) {
      const key = s.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(s);
      }
    }
    return out;
  };

  const summarize = (text, maxLen = 140) => {
    const t = text.replace(/\s+/g, " ").trim();
    if (t.length <= maxLen) return t;
    // Prefer sentence boundary
    const sentenceEnd = t.indexOf(".", 60);
    if (sentenceEnd > 0 && sentenceEnd < maxLen)
      return t.slice(0, sentenceEnd + 1);
    return t.slice(0, maxLen - 1) + "…";
  };

  const extractSuggestionsFromComment = (commentRoot) => {
    const body = commentRoot.querySelector(".js-comment-body, .comment-body");
    if (!body) return [];

    const liItems = extractListItems(body);
    const patternLines = extractPatternLines(body);
    const changeBlocks = extractSuggestedChangeBlocks(body);

    const combined = dedupe([...liItems, ...patternLines, ...changeBlocks]);
    return combined;
  };

  const findCommentRootsInTurboFrame = (frame) => {
    // A "comment root" is usually an "article" with role="article" or a .js-comment container
    // Also including Copilot-style discussion divs
    const candidates = Array.from(
      frame.querySelectorAll('article, .js-comment, div[id^="discussion_r"]'),
    );
    // Filter to those that look like comment containers
    return candidates.filter((c) =>
      c.querySelector(
        ".js-comment-body, .comment-body, div.edit-comment-hide > task-lists",
      ),
    );
  };

  const extractAllSuggestions = () => {
    const frames = Array.from(
      document.querySelectorAll(
        'turbo-frame[id^="review-thread-or-comment-id-"]',
      ),
    );
    const all = [];
    frames.forEach((frame) => {
      const comments = findCommentRootsInTurboFrame(frame);
      comments.forEach((commentRoot, idx) => {
        // Prefer Copilot-authored comments, but if none detected we still include suggestions
        const copilot = isCopilotAuthor(commentRoot);
        const suggestions = extractSuggestionsFromComment(commentRoot);
        const anchor = getAnchorUrlForComment(commentRoot);
        const frameId =
          frame.id || `frame-${hashString(frame.outerHTML.slice(0, 512))}`;
        suggestions.forEach((text, i) => {
          const id = `${frameId}:${idx}:${i}:${hashString(text)}`;
          const context = {
            filePath: findFilePathInFrame(frame),
            ...findLineRangeInFrame(frame),
            codeMentioned: findCodeMentionedInFrame(frame),
            reviewText: extractReviewTextOnly(commentRoot),
            suggestedChange: extractPrimarySuggestedChange(commentRoot),
          };

          all.push({
            id,
            text,
            summary: summarize(context.reviewText || text),
            sourceUrl: anchor,
            isCopilot: copilot,
            filePath: context.filePath || null,
            lineStart: context.lineStart,
            lineEnd: context.lineEnd,
            codeMentioned: context.codeMentioned,
            reviewText: context.reviewText,
            suggestedChange: context.suggestedChange,
          });
        });
      });
    });

    // If any Copilot-authored suggestions exist, filter to those; else return all
    const hasCopilot = all.some((s) => s.isCopilot);
    return hasCopilot ? all.filter((s) => s.isCopilot) : all;
  };

  // --------------------- UI ---------------------

  const UI = (() => {
    let shadowHost,
      shadow,
      panel,
      listContainer,
      headerInfo,
      copyBtn,
      copyMdBtn,
      copyJsonBtn,
      selectAllBtn,
      refreshBtn,
      statusMsg;
    const deselected = storage.getDeselectedSet();
    const ignored = storage.getIgnoredSet();

    const styles = `
      :host { all: initial; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"; color: #24292f; }
      .crtp-panel { position: fixed; right: 16px; top: 16px; bottom: auto; width: 450px; max-height: 80vh; background: #fff; border: 1px solid #d0d7de; border-radius: 12px; box-shadow: 0 8px 24px rgba(140,149,159,0.2); z-index: 2147483647; display: none; flex-direction: column; overflow: hidden; animation: crtp-slide-down 0.2s ease-out; }
      @keyframes crtp-slide-down { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
      .crtp-panel.open { display: flex; }
      .crtp-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid #d0d7de; background: #f6f8fa; }
      .crtp-title { font-size: 14px; font-weight: 600; color: #24292f; }
      .crtp-actions { display: flex; gap: 8px; align-items: center; }
      .crtp-btn { font-size: 12px; padding: 5px 10px; border-radius: 6px; border: 1px solid rgba(27,31,36,0.15); background: #f6f8fa; color: #24292f; cursor: pointer; font-weight: 500; transition: all 0.2s; }
      .crtp-btn.primary { background: #0969da; color: #fff; border-color: rgba(27,31,36,0.15); }
      .crtp-btn:hover { background-color: #f3f4f6; border-color: rgba(27,31,36,0.15); }
      .crtp-btn.primary:hover { background: #0550ae; }
      .crtp-status { font-size: 12px; color: #57606a; margin-left: 6px; }
      .crtp-body { overflow: auto; padding: 0; background: #fff; }
      .crtp-item { padding: 16px; border-bottom: 1px solid #d8dee4; display: flex; gap: 12px; align-items: start; transition: background 0.15s; }
      .crtp-item:hover { background: #f6f8fa; }
      .crtp-item:last-child { border-bottom: none; }
      .crtp-checkbox { margin-top: 3px; cursor: pointer; width: 16px; height: 16px; accent-color: #0969da; flex-shrink: 0; }
      .crtp-item-main { display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1; }
      .crtp-meta { display: flex; flex-wrap: wrap; gap: 6px; font-size: 11px; color: #57606a; margin-bottom: 4px; align-items: center; }
      .crtp-file { font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace; background: #f6f8fa; padding: 2px 6px; border-radius: 4px; border: 1px solid #d0d7de; color: #24292f; }
      .crtp-lines { font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace; color: #57606a; background: #fff; border: 1px solid #d0d7de; padding: 2px 6px; border-radius: 4px; }
      .crtp-summary { font-size: 14px; font-weight: 600; line-height: 1.4; color: #1F2328; }
      .crtp-details { font-size: 13px; color: #57606a; margin-top: 8px; white-space: pre-wrap; background: #f6f8fa; padding: 8px 12px; border-radius: 6px; border: 1px solid #d0d7de; }
      .crtp-source { font-size: 11px; color: #57606a; text-decoration: underline; }
      .crtp-empty { padding: 32px; font-size: 14px; color: #57606a; text-align: center; display: flex; flex-direction: column; gap: 8px; }
      .crtp-footer { padding: 12px 16px; border-top: 1px solid #d0d7de; background: #f6f8fa; font-size: 12px; display: flex; align-items: center; justify-content: space-between; border-bottom-left-radius: 12px; border-bottom-right-radius: 12px; }
      .crtp-label { font-size: 12px; color: #57606a; }
      .crtp-pill { display: inline-flex; align-items: center; gap: 6px; background: #ddf4ff; color: #0969da; border: 1px solid #b6e3ff; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }
      .crtp-ignore-btn { font-size: 12px; color: #57606a; background: none; border: none; cursor: pointer; padding: 4px 8px; margin-left: auto; border-radius: 4px; }
      .crtp-ignore-btn:hover { color: #cf222e; background: #ffebe9; }
    `;

    const create = (tag, props = {}, children = []) => {
      const el = document.createElement(tag);
      Object.assign(el, props);
      (children || []).forEach((c) => el.appendChild(c));
      return el;
    };

    const openPanel = () => panel.classList.add("open");
    const closePanel = () => panel.classList.remove("open");
    const togglePanel = () => panel.classList.toggle("open");

    const setStatus = (text) => {
      statusMsg.textContent = text || "";
    };

    const setHeaderInfo = (total, selected) => {
      headerInfo.innerHTML = "";
      headerInfo.appendChild(
        create("span", {
          className: "crtp-pill",
          innerText: `Found: ${total}`,
        }),
      );
      headerInfo.appendChild(
        create("span", {
          className: "crtp-pill",
          innerText: `Selected: ${selected}`,
        }),
      );
    };

    const renderHeaderInfo = () => {
      const items = state.suggestions.filter((s) => !ignored.has(s.id));
      const count = items.filter((s) => !deselected.has(s.id)).length;
      setHeaderInfo(items.length, count);
    };

    const saveDeselection = () => storage.saveDeselectedSet(deselected);
    const saveIgnored = () => storage.saveIgnoredSet(ignored);

    const onSelectAll = () => {
      const visible = state.suggestions.filter((s) => !ignored.has(s.id));
      const allIds = visible.map((s) => s.id);
      const allSelected = allIds.every((id) => !deselected.has(id));
      if (allSelected) {
        // Unselect all (add to deselected)
        allIds.forEach((id) => deselected.add(id));
      } else {
        // Select all (remove from deselected)
        allIds.forEach((id) => deselected.delete(id));
      }
      saveDeselection();
      renderList();
    };

    const onCopy = async () => {
      let selected = state.suggestions.filter(
        (s) => !ignored.has(s.id) && !deselected.has(s.id),
      );
      if (selected.length === 0) {
        setStatus("No suggestions selected to copy");
        return;
      }
      const prompt = buildPrompt(selected);
      try {
        await navigator.clipboard.writeText(prompt);
        setStatus(`Copied ${selected.length} suggestion(s) to clipboard`);
      } catch (e) {
        setStatus("Copy failed: " + (e?.message || "unknown error"));
      }
    };

    const buildPrompt = (items) => {
      const prUrl = location.href;
      const header = [
        "Task: Apply the following GitHub Copilot review suggestions to the codebase in this PR.",
        `PR: ${prUrl}`,
        "Instructions:",
        "- For each item, implement the change described.",
        "- If multiple files are impacted, update all relevant locations.",
        "- Preserve existing behavior unless a change is explicitly requested.",
        "",
      ].join("\n");

      const body = items
        .map((s, idx) => {
          const linesLabel =
            s.lineStart && s.lineEnd
              ? s.lineStart === s.lineEnd
                ? `L${s.lineStart}`
                : `L${s.lineStart}-L${s.lineEnd}`
              : null;

          const fileLine =
            s.filePath || linesLabel
              ? `File: ${s.filePath || "unknown"}${linesLabel ? ` (${linesLabel})` : ""}`
              : null;

          const review = s.reviewText ? `Review:\n${s.reviewText}` : null;

          const codeMentioned = s.codeMentioned
            ? `Code mentioned:\n${s.codeMentioned}`
            : null;

          let suggestionBlock = null;
          if (s.suggestedChange) {
            suggestionBlock = s.suggestedChange.trim().startsWith("Suggested")
              ? s.suggestedChange
              : `Suggested change:\n${s.suggestedChange}`;
          } else if (s.text && s.text !== s.summary) {
            suggestionBlock = s.text.trim().startsWith("Suggested")
              ? s.text
              : `Suggested change:\n${s.text}`;
          }

          return [
            `#${idx + 1} ${s.summary}`,
            fileLine,
            codeMentioned,
            review,
            suggestionBlock,
            "",
          ]
            .filter(Boolean)
            .join("\n");
        })
        .join("\n");

      return header + "\n" + body;
    };

    const buildMarkdown = (items) => {
      const prUrl = location.href;
      const linesFor = (s) =>
        s.lineStart && s.lineEnd
          ? s.lineStart === s.lineEnd
            ? `L${s.lineStart}`
            : `L${s.lineStart}-L${s.lineEnd}`
          : null;

      const sections = items.map((s, idx) => {
        const lineLabel = linesFor(s);
        const titleParts = [];
        if (s.filePath) titleParts.push(s.filePath);
        if (lineLabel) titleParts.push(`(${lineLabel})`);
        const title = titleParts.length ? `${titleParts.join(" ")}` : "";

        const blocks = [];
        blocks.push(`### ${idx + 1}. ${s.summary}`);
        if (title) blocks.push(`File: ${title}`);
        if (s.codeMentioned) {
          blocks.push(`Code mentioned:\n\n\`\`\`\n${s.codeMentioned}\n\`\`\``);
        }
        if (s.reviewText) blocks.push(`Review:\n\n${s.reviewText}`);
        if (s.suggestedChange) {
          blocks.push(
            `Suggested change:\n\n\`\`\`\n${s.suggestedChange}\n\`\`\``,
          );
        }

        return blocks.join("\n\n");
      });

      return [`## PR\n${prUrl}`, "", ...sections].join("\n");
    };

    const buildJSON = (items) => {
      const normalized = items.map((s) => ({
        id: s.id,
        filePath: s.filePath || null,
        lineStart: s.lineStart ?? null,
        lineEnd: s.lineEnd ?? null,
        summary: s.summary,
        codeMentioned: s.codeMentioned || null,
        reviewText: s.reviewText || null,
        suggestedChange: s.suggestedChange || null,
        sourceUrl: s.sourceUrl,
      }));
      return JSON.stringify(
        { pr: location.href, suggestions: normalized },
        null,
        2,
      );
    };

    const renderList = () => {
      listContainer.innerHTML = "";
      const items = state.suggestions.filter((s) => !ignored.has(s.id));

      if (items.length === 0) {
        listContainer.appendChild(
          create("div", {
            className: "crtp-empty",
            innerText:
              "No suggestions found. Try refreshing or expanding more review threads.",
          }),
        );
        renderHeaderInfo();
        return;
      }

      items.forEach((s) => {
        const checkbox = create("input", {
          type: "checkbox",
          className: "crtp-checkbox",
        });
        checkbox.checked = !deselected.has(s.id);
        checkbox.addEventListener("change", () => {
          if (checkbox.checked) deselected.delete(s.id);
          else deselected.add(s.id);
          saveDeselection();
          renderHeaderInfo();
        });

        // Ignore button
        const ignoreBtn = create("button", {
          className: "crtp-ignore-btn",
          innerText: "Skip",
          title: "Remove from list",
        });
        ignoreBtn.addEventListener("click", () => {
          ignored.add(s.id);
          saveIgnored();
          renderList();
          renderHeaderInfo();
        });

        // Meta info: File path and Lines
        const metaChildren = [];
        if (s.filePath) {
          metaChildren.push(
            create("span", { className: "crtp-file", innerText: s.filePath }),
          );
        }

        if (s.lineStart || s.lineEnd) {
          const lr =
            s.lineStart && s.lineEnd
              ? s.lineStart === s.lineEnd
                ? `L${s.lineStart}`
                : `L${s.lineStart}-L${s.lineEnd}`
              : s.lineStart
                ? `L${s.lineStart}`
                : s.lineEnd
                  ? `L${s.lineEnd}`
                  : "";
          if (lr) {
            metaChildren.push(
              create("span", { className: "crtp-lines", innerText: lr }),
            );
          }
        }

        const meta = create("div", { className: "crtp-meta" }, metaChildren);

        const summary = create("div", {
          className: "crtp-summary",
          innerText: s.summary,
        });

        const detailsParts = [];
        if (s.reviewText) detailsParts.push(`Review:\n${s.reviewText}`);
        if (s.codeMentioned) detailsParts.push(`Code:\n${s.codeMentioned}`);
        if (s.suggestedChange) {
          detailsParts.push(`Suggested change:\n${s.suggestedChange}`);
        } else if (s.text) {
          detailsParts.push(s.text);
        }
        const details = create("div", {
          className: "crtp-details",
          innerText: detailsParts.join("\n\n"),
        });
        if (detailsParts.length === 0) details.style.display = "none";

        const main = create("div", { className: "crtp-item-main" }, [
          meta,
          summary,
          details,
        ]);
        const row = create("div", { className: "crtp-item" }, [
          checkbox,
          main,
          ignoreBtn,
        ]);

        listContainer.appendChild(row);
      });

      renderHeaderInfo();
    };

    const renderPanel = () => {
      panel.innerHTML = "";
      const headerLeft = create("div", {
        className: "crtp-title",
        innerText: "Copilot Suggestions",
      });
      headerInfo = create("div", {});
      const header = create("div", { className: "crtp-header" }, [
        headerLeft,
        create("div", { className: "crtp-actions" }, [
          (refreshBtn = create("button", {
            className: "crtp-btn",
            innerText: "Refresh",
          })),
          (selectAllBtn = create("button", {
            className: "crtp-btn",
            innerText: "Select All/None",
          })),
          (copyBtn = create("button", {
            className: "crtp-btn primary",
            innerText: "Copy Prompt",
          })),
          (copyMdBtn = create("button", {
            className: "crtp-btn",
            innerText: "Copy MD",
            title: "Copy Markdown summary of selected suggestions",
          })),
          (copyJsonBtn = create("button", {
            className: "crtp-btn",
            innerText: "Copy JSON",
            title: "Copy structured JSON of selected suggestions",
          })),
        ]),
      ]);

      listContainer = create("div", { className: "crtp-body" });

      const footerLeft = create("div", {
        className: "crtp-label",
        innerText: "Build a single structured prompt for selected items.",
      });
      statusMsg = create("div", { className: "crtp-status" });
      const footer = create("div", { className: "crtp-footer" }, [
        footerLeft,
        statusMsg,
      ]);

      panel.appendChild(header);
      panel.appendChild(listContainer);
      panel.appendChild(footer);

      refreshBtn.addEventListener("click", () => {
        setStatus("Refreshing…");
        state.refresh();
      });
      selectAllBtn.addEventListener("click", onSelectAll);
      copyBtn.addEventListener("click", onCopy);

      copyMdBtn.addEventListener("click", async () => {
        let selected = state.suggestions.filter(
          (s) => !ignored.has(s.id) && !deselected.has(s.id),
        );
        if (selected.length === 0) {
          setStatus("No suggestions selected to copy");
          return;
        }
        try {
          await navigator.clipboard.writeText(buildMarkdown(selected));
          setStatus(`Copied MD for ${selected.length} suggestion(s)`);
        } catch (e) {
          setStatus("Copy failed: " + (e?.message || "unknown error"));
        }
      });

      copyJsonBtn.addEventListener("click", async () => {
        let selected = state.suggestions.filter(
          (s) => !ignored.has(s.id) && !deselected.has(s.id),
        );
        if (selected.length === 0) {
          setStatus("No suggestions selected to copy");
          return;
        }
        try {
          await navigator.clipboard.writeText(buildJSON(selected));
          setStatus(`Copied JSON for ${selected.length} suggestion(s)`);
        } catch (e) {
          setStatus("Copy failed: " + (e?.message || "unknown error"));
        }
      });

      renderHeaderInfo();
      renderList();
    };

    const mount = () => {
      if (shadowHost) return;

      shadowHost = document.createElement("div");
      shadowHost.setAttribute("data-crtp", "1");
      document.documentElement.appendChild(shadowHost);
      shadow = shadowHost.attachShadow({ mode: "open" });

      const style = document.createElement("style");
      style.textContent = styles;

      panel = create("div", { className: "crtp-panel" });

      shadow.appendChild(style);
      shadow.appendChild(panel);

      renderPanel();
      renderHeaderInfo();
    };

    return {
      mount,
      render: renderPanel,
      renderList,
      get deselected() {
        return deselected;
      },
      get ignored() {
        return ignored;
      },
      setHeaderInfo,
      setStatus,
      openPanel,
      togglePanel,
    };
  })();

  // --------------------- State and Orchestration ---------------------

  const state = {
    suggestions: [],
    setSuggestions(arr) {
      this.suggestions = arr;
      UI.renderList();
    },
    refresh: debounce(() => {
      const arr = extractAllSuggestions();
      state.setSuggestions(arr);
      UI.setStatus(`Found ${arr.length} suggestion(s)`);
    }, 150),
  };

  // Initialize
  UI.mount();
  state.refresh();

  // Automatically refresh when page updates (GitHub uses turbo/pjax)
  const bodyObserver = new MutationObserver(
    debounce((mutations) => {
      // Only refresh if relevant turbo-frame or comment areas changed
      const relevant = mutations.some((m) => {
        return Array.from(m.addedNodes).some(
          (n) =>
            n.nodeType === 1 &&
            (n.matches?.('turbo-frame[id^="review-thread-or-comment-id-"]') ||
              n.querySelector?.(
                'turbo-frame[id^="review-thread-or-comment-id-"]',
              ) ||
              n.matches?.(".js-comment, article") ||
              n.querySelector?.(".js-comment, article")),
        );
      });
      if (relevant) state.refresh();
    }, 300),
  );

  bodyObserver.observe(document.body, { childList: true, subtree: true });

  // Also refresh on navigation within the SPA
  window.addEventListener("turbo:load", () => state.refresh());
  window.addEventListener("pjax:end", () => state.refresh());
  window.addEventListener("popstate", () => {
    if (isPRPage()) {
      UI.mount();
      state.refresh();
    }
  });

  // Expose for debugging (optional)
  // Expose debugging and helper functions
  window.__CRTP__ = {
    refresh: () => state.refresh(),
    getSuggestions: () =>
      state.suggestions.filter((s) => !UI.ignored.has(s.id)),
    getSelectedIds: () => {
      const all = state.suggestions
        .filter((s) => !UI.ignored.has(s.id))
        .map((s) => s.id);
      return all.filter((id) => !UI.deselected.has(id));
    },
    buildPrompt: (items) => {
      const prUrl = location.href;
      const header = [
        "Task: Apply the following GitHub Copilot review suggestions to the codebase in this PR.",
        `PR: ${prUrl}`,
        "Instructions:",
        "- For each item, implement the change described.",
        "- If multiple files are impacted, update all relevant locations.",
        "- Preserve existing behavior unless a change is explicitly requested.",
        "",
      ].join("\n");

      const body = items
        .map((s, idx) => {
          const linesLabel =
            s.lineStart && s.lineEnd
              ? s.lineStart === s.lineEnd
                ? `L${s.lineStart}`
                : `L${s.lineStart}-L${s.lineEnd}`
              : null;

          const fileLine =
            s.filePath || linesLabel
              ? `File: ${s.filePath || "unknown"}${linesLabel ? ` (${linesLabel})` : ""}`
              : null;

          const review = s.reviewText ? `Review:\n${s.reviewText}` : null;

          const codeMentioned = s.codeMentioned
            ? `Code mentioned:\n${s.codeMentioned}`
            : null;

          let suggestionBlock = null;
          if (s.suggestedChange) {
            suggestionBlock = s.suggestedChange.trim().startsWith("Suggested")
              ? s.suggestedChange
              : `Suggested change:\n${s.suggestedChange}`;
          } else if (s.text && s.text !== s.summary) {
            suggestionBlock = s.text.trim().startsWith("Suggested")
              ? s.text
              : `Suggested change:\n${s.text}`;
          }

          return [
            `#${idx + 1} ${s.summary}`,
            fileLine,
            codeMentioned,
            review,
            suggestionBlock,
            "",
          ]
            .filter(Boolean)
            .join("\n");
        })
        .join("\n");

      return header + "\n" + body;
    },
    buildMarkdown: (items) => {
      const prUrl = location.href;
      const linesFor = (s) =>
        s.lineStart && s.lineEnd
          ? s.lineStart === s.lineEnd
            ? `L${s.lineStart}`
            : `L${s.lineStart}-L${s.lineEnd}`
          : null;

      const sections = items.map((s, idx) => {
        const lineLabel = linesFor(s);
        const titleParts = [];
        if (s.filePath) titleParts.push(s.filePath);
        if (lineLabel) titleParts.push(`(${lineLabel})`);
        const title = titleParts.length ? `${titleParts.join(" ")}` : "";

        const blocks = [];
        blocks.push(`### ${idx + 1}. ${s.summary}`);
        if (title) blocks.push(`File: ${title}`);
        if (s.codeMentioned) {
          blocks.push(`Code mentioned:\n\n\`\`\`\n${s.codeMentioned}\n\`\`\``);
        }
        if (s.reviewText) blocks.push(`Review:\n\n${s.reviewText}`);
        if (s.suggestedChange) {
          blocks.push(
            `Suggested change:\n\n\`\`\`\n${s.suggestedChange}\n\`\`\``,
          );
        }

        return blocks.join("\n\n");
      });

      return [`## PR\n${prUrl}`, "", ...sections].join("\n");
    },
    buildJSON: (items) => {
      const normalized = items.map((s) => ({
        id: s.id,
        filePath: s.filePath || null,
        lineStart: s.lineStart ?? null,
        lineEnd: s.lineEnd ?? null,
        summary: s.summary,
        codeMentioned: s.codeMentioned || null,
        reviewText: s.reviewText || null,
        suggestedChange: s.suggestedChange || null,
        sourceUrl: s.sourceUrl,
      }));
      return JSON.stringify(
        { pr: location.href, suggestions: normalized },
        null,
        2,
      );
    },
  };

  // Listen for messages from the extension popup to provide data without requiring script injection
  if (
    typeof chrome !== "undefined" &&
    chrome.runtime &&
    chrome.runtime.onMessage
  ) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (!msg || !msg.type) return;

      if (msg.type === "CRTP_QUERY") {
        const suggestions = state.suggestions.filter(
          (s) => !UI.ignored.has(s.id),
        );
        const selectedIds = suggestions
          .filter((s) => !UI.deselected.has(s.id))
          .map((s) => s.id);
        sendResponse({
          isPR: isPRPage(),
          hasCRTP: true,
          found: suggestions.length,
          selected: selectedIds.length,
          suggestions,
          selectedIds,
        });
        return true;
      }

      if (msg.type === "CRTP_REFRESH") {
        state.refresh();
        sendResponse({ ok: true });
        return true;
      }

      if (msg.type === "CRTP_TOGGLE_PANEL") {
        try {
          UI.togglePanel();
          sendResponse({ ok: true });
        } catch {
          sendResponse({ ok: false });
        }
        return true;
      }

      if (msg.type === "CRTP_OPEN_PANEL") {
        try {
          UI.openPanel();
          sendResponse({ ok: true });
        } catch {
          sendResponse({ ok: false });
        }
        return true;
      }
      if (msg.type === "CRTP_BUILD_PROMPT") {
        const ids = Array.isArray(msg.ids) ? msg.ids : [];
        const items = state.suggestions.filter((s) => ids.includes(s.id));
        const prompt = window.__CRTP__.buildPrompt(items);
        sendResponse({ prompt });
        return true;
      }

      if (msg.type === "CRTP_BUILD_MARKDOWN") {
        const ids = Array.isArray(msg.ids) ? msg.ids : [];
        const items = state.suggestions.filter((s) => ids.includes(s.id));
        const markdown = window.__CRTP__.buildMarkdown(items);
        sendResponse({ markdown });
        return true;
      }

      if (msg.type === "CRTP_BUILD_JSON") {
        const ids = Array.isArray(msg.ids) ? msg.ids : [];
        const items = state.suggestions.filter((s) => ids.includes(s.id));
        const json = window.__CRTP__.buildJSON(items);
        sendResponse({ json });
        return true;
      }
    });
  }
})();
