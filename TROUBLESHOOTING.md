# Troubleshooting Guide

This guide helps you diagnose and fix issues with the Copilot Review to Prompt extension.

## Common Issues

### 1. Extension Not Detecting Any Suggestions

**Symptoms:**
- Panel shows "No suggestions found" or "0 found"
- Extension icon doesn't activate on PR pages

**Solutions:**

1. **Verify you're on a GitHub PR page**
   - URL must match: `https://github.com/*/pull/*`
   - Extension only works on Pull Request pages, not Issues or other GitHub pages

2. **Check if Copilot has left review comments**
   - Look for comments from the "Copilot" user with an AI badge
   - Comments must be in the "Files changed" or "Conversation" tab
   - The extension looks for `turbo-frame` elements with IDs starting with `review-thread-or-comment-id-`

3. **Refresh the page and try again**
   - Click the extension icon or use the refresh button in the panel
   - GitHub's dynamic loading may require a page refresh

4. **Open the browser console** (F12 or Cmd+Option+J)
   - Look for errors starting with "CRTP" or related to the extension
   - Check if content script loaded: type `window.__CRTP__` - should return an object

### 2. Line Numbers Not Showing Correctly

**Symptoms:**
- File path is detected but line numbers show as "null" or missing
- Line range appears incorrect

**Solutions:**

1. **Check the HTML structure**
   - GitHub may have changed their DOM structure
   - Open DevTools and inspect the review comment frame
   - Look for elements with:
     - Class: `.js-multi-line-preview-start`, `.js-multi-line-preview-end`
     - Attribute: `data-line-number`
     - Class: `.blob-num`

2. **Line numbers with plus signs**
   - The extension now handles "+67" format (v1.1+)
   - If you see raw "+67" in output, you may need to update the extension

3. **Verify the selector**
   - The extension looks in: `details-collapsible details > div > div:first-child`
   - Pattern matches: "Lines 42-45", "Line 42", "Comment on lines +67 to +87"

### 3. Plain Text Comments Not Being Extracted

**Symptoms:**
- Copilot leaves a comment but it's not captured
- Only structured lists or code blocks work

**Solutions:**

1. **Update to version 1.1+**
   - Earlier versions only captured structured suggestions
   - Version 1.1+ captures plain paragraph text as suggestions

2. **Check comment structure**
   - Open DevTools and inspect the comment
   - Verify it has class `.js-comment-body` or `.comment-body`
   - Check if text is inside a `<p>` or other text element

3. **Look for exclusions**
   - Very short comments (< 10 characters) are ignored
   - Comments containing only code blocks may not extract text

### 4. Wrong Author Detection

**Symptoms:**
- Human comments are being captured instead of Copilot
- Copilot comments are being ignored

**Solutions:**

1. **Check author link**
   - The extension looks for `<a class="author">` with text containing "copilot"
   - Href should contain "copilot" or "github-copilot"
   - Look for badges with "bot" or "AI" label

2. **Verify data attributes**
   - Modern GitHub uses `data-hovercard-type="copilot"`
   - The extension checks multiple fallback patterns

3. **Mixed results strategy**
   - If ANY Copilot comments are found, only those are shown
   - If NO Copilot comments detected, ALL comments are shown
   - This prevents false negatives

### 5. Extension Panel Won't Open

**Symptoms:**
- Clicking extension icon does nothing
- Panel doesn't appear on page

**Solutions:**

1. **Check permissions**
   - Extension needs `clipboardWrite` permission
   - Host permissions for `https://github.com/*`
   - Verify in `chrome://extensions/`

2. **Reload the extension**
   - Go to `chrome://extensions/`
   - Click reload button for this extension
   - Refresh the GitHub page

3. **Check for conflicts**
   - Other extensions may interfere with Shadow DOM
   - Try disabling other extensions temporarily
   - Dark mode extensions can sometimes conflict

4. **Console errors**
   - Open DevTools (F12)
   - Look for JavaScript errors
   - Check if `UI.mount()` was called

### 6. Copy to Clipboard Not Working

**Symptoms:**
- Clicking "Copy Prompt" does nothing
- No confirmation message appears

**Solutions:**

1. **Grant clipboard permission**
   - Chrome may block clipboard access
   - Click the address bar for permission prompts
   - Check `chrome://settings/content/clipboard`

2. **Try different copy buttons**
   - Use "Copy as Markdown" or "Copy as JSON" instead
   - These use the same clipboard API

3. **Manual fallback**
   - Select the text in the panel manually
   - Use Ctrl+C (Cmd+C on Mac)

## Debugging Tools

### Using the Test Page

1. Open `test.html` in your browser
2. The extension should work on this local test page
3. Check the test results to see which extraction functions work
4. Compare with actual GitHub PR page behavior

### Browser Console Commands

When on a GitHub PR page with the extension loaded:

```javascript
// Check if extension loaded
window.__CRTP__

// Get current suggestions
window.__CRTP__.getSuggestions()

// Get selected suggestion IDs
window.__CRTP__.getSelectedIds()

// Build prompt manually
window.__CRTP__.buildPrompt(window.__CRTP__.getSuggestions())

// Force refresh
chrome.runtime.sendMessage({ type: "CRTP_REFRESH" })
```

### Inspecting the DOM

1. Open DevTools (F12)
2. Go to Elements tab
3. Search for:
   - `turbo-frame[id^="review-thread-or-comment-id-"]` - Review frames
   - `.js-comment` - Comment containers
   - `a.author` - Author links
   - `.js-comment-body` - Comment body text

### Checking Extension State

```javascript
// In console on GitHub PR page
const state = {
  isPR: /^\/[^/]+\/[^/]+\/pull\/\d+/.test(location.pathname),
  frames: document.querySelectorAll('turbo-frame[id^="review-thread-or-comment-id-"]').length,
  comments: document.querySelectorAll('.js-comment, div[id^="discussion_r"]').length,
  copilotLinks: document.querySelectorAll('a.author[href*="copilot"]').length
};
console.table(state);
```

## Reporting Issues

If you've tried the above solutions and still have issues, please provide:

1. **Environment:**
   - Browser (Chrome/Edge/etc.) and version
   - Extension version (check `manifest.json`)
   - Operating system

2. **GitHub Context:**
   - Is it a public or private repository?
   - Can you share a screenshot of the Copilot comment?
   - Any console errors?

3. **Steps to Reproduce:**
   - Exact steps that lead to the issue
   - Expected vs actual behavior
   - Whether it works on `test.html`

4. **Console Output:**
   - Any errors in browser console
   - Output of debug commands above
   - Network tab errors (if any)

## Advanced Debugging

### Modify Selectors

If GitHub changes their HTML structure, you may need to update selectors in `content.js`:

1. Find the function causing issues (e.g., `findFilePathInFrame`)
2. Update the querySelector strings to match new GitHub structure
3. Test with `test.html` first
4. Reload extension and test on actual PR

### Enable Verbose Logging

Add this near the top of `content.js`:

```javascript
const DEBUG = true;
const log = (...args) => DEBUG && console.log('[CRTP]', ...args);
```

Then add `log()` calls throughout the extraction functions to trace execution.

### Testing Extraction Functions

In the browser console:

```javascript
// Test file path extraction
const frame = document.querySelector('turbo-frame[id^="review-thread"]');
const filePath = frame.querySelector('details-collapsible summary a')?.textContent.trim();
console.log('File path:', filePath);

// Test line range extraction
const startSpan = frame.querySelector('.js-multi-line-preview-start');
const endSpan = frame.querySelector('.js-multi-line-preview-end');
console.log('Lines:', startSpan?.textContent, 'to', endSpan?.textContent);

// Test comment body
const comment = frame.querySelector('.js-comment-body, .comment-body');
console.log('Comment text:', comment?.textContent.trim());
```

## Known Limitations

1. **Dynamic Content**: Comments loaded after initial page load may not be detected (use refresh button)
2. **Private Repos**: Same permissions as public repos, but verify extension has access
3. **GitHub Enterprise**: May have different DOM structure - selectors might need adjustment
4. **Nested Comments**: Replies to comments may not be captured separately
5. **Resolved Comments**: Collapsed/resolved threads require expansion to be detected

## Need More Help?

- Check the `turbo-frame.html` file for reference HTML structure
- Review the `CHANGELOG.md` for recent fixes
- Examine `content.js` extraction functions directly
- Create an issue on the project repository with debug info