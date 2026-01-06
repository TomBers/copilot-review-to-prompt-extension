# Quick Reference Card

## Installation

1. Clone or download this repository
2. Open Chrome → `chrome://extensions/`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked**
5. Select the `copilot-review-to-prompt-extension` directory

## Usage

### Basic Workflow

1. **Navigate** to a GitHub Pull Request with Copilot reviews
2. **Click** the extension icon in your browser toolbar
3. **Review** the detected suggestions in the panel
4. **Select/Deselect** items you want to include
5. **Copy** the prompt using one of the buttons
6. **Paste** into ChatGPT, Claude, or your preferred AI assistant

### Panel Buttons

| Button | Description |
|--------|-------------|
| **Copy Prompt** | Optimized format for AI chat interfaces |
| **Copy as Markdown** | Great for documentation or issue tickets |
| **Copy as JSON** | For programmatic processing |
| **Select All** | Toggle all suggestions on/off |
| **Refresh** | Re-scan the page for new comments |
| **✗ (X button)** | Ignore this suggestion permanently |

### Keyboard Shortcuts

- **Click extension icon** → Toggle panel open/close
- **Ctrl+C / Cmd+C** → Copy selected text manually

## What Gets Extracted

The extension captures:

- ✅ **File paths** (e.g., `lib/example/component.ex`)
- ✅ **Line ranges** (e.g., Lines 67-87)
- ✅ **Review text** (the Copilot's explanation)
- ✅ **Code snippets** (the code being reviewed)
- ✅ **Suggested changes** (diffs and code blocks)
- ✅ **Plain text comments** (paragraph-style feedback)
- ✅ **Structured lists** (bullet or numbered suggestions)

## Comment Formats Supported

### Plain Text (NEW in v1.1)
```
The label elements create nested labels, which is invalid HTML...
```

### Bullet Lists
```
- Use async/await instead of callbacks
- Add error handling for network requests
- Cache results to avoid redundant calls
```

### Numbered Lists
```
1. Refactor the function to be more modular
2. Add input validation
3. Include unit tests
```

### Pattern Prefixes
```
Suggestion: Extract this logic into a helper function
Fix: Remove the unused import statement
Improve: Add more descriptive variable names
```

### Code Blocks
````
```javascript
// Suggested code here
```
````

### Diff Blocks
```
- old code
+ new code
```

## Output Formats

### Prompt Format
Optimized for AI assistants:
```
I have a Pull Request with the following Copilot code review suggestions.
Please help me address them:

[PR URL]

FILE: lib/example/component.ex (Lines: 67-87)
REVIEW: The label elements create nested labels...
CODE MENTIONED: <label>View Mode</label>
```

### Markdown Format
Good for documentation:
```markdown
# Code Review Suggestions

## lib/example/component.ex (Lines: 67-87)
**Review:** The label elements create nested labels...

**Code:**
<label>View Mode</label>
```

### JSON Format
For automation:
```json
{
  "pr": "https://github.com/user/repo/pull/123",
  "suggestions": [
    {
      "id": "...",
      "filePath": "lib/example/component.ex",
      "lineStart": 67,
      "lineEnd": 87,
      "summary": "The label elements create...",
      "reviewText": "Full review text...",
      "codeMentioned": "...",
      "sourceUrl": "..."
    }
  ]
}
```

## Troubleshooting

### No Suggestions Found
- ✓ Verify you're on a **Pull Request** page (not Issues)
- ✓ Check that **Copilot has left review comments**
- ✓ Try clicking the **Refresh** button
- ✓ Reload the page and try again

### Wrong Line Numbers
- ✓ Update to **version 1.1+** (handles +67 format)
- ✓ Click **Refresh** after GitHub loads content
- ✓ Check that line numbers are visible in GitHub UI

### Copy Not Working
- ✓ Check browser clipboard permissions
- ✓ Look for permission prompt in address bar
- ✓ Try manually selecting and copying (Ctrl+C)

### Panel Won't Open
- ✓ Reload extension at `chrome://extensions/`
- ✓ Refresh the GitHub page
- ✓ Check console (F12) for errors

## Storage & Privacy

- **Local Storage Only**: Selection state saved per-PR in browser localStorage
- **No External Requests**: All processing happens locally in your browser
- **No Data Collection**: Extension doesn't send any data anywhere
- **Private Repos**: Works the same as public repos

## Browser Compatibility

| Browser | Support |
|---------|---------|
| Chrome | ✅ Full support |
| Edge | ✅ Full support |
| Brave | ✅ Full support |
| Firefox | ❌ Manifest V3 format (Chrome-specific) |

## Testing

Use the included `test.html` file to verify extraction logic:

1. Open `test.html` in browser
2. Tests run automatically
3. Check results for any failures
4. Compare with GitHub PR behavior

## Console Debugging

Open DevTools (F12) and try:

```javascript
// Check if loaded
window.__CRTP__

// Get suggestions
window.__CRTP__.getSuggestions()

// Get selected IDs
window.__CRTP__.getSelectedIds()

// Build prompt
window.__CRTP__.buildPrompt(window.__CRTP__.getSuggestions())
```

## Permissions Required

- **clipboardWrite**: To copy prompts to clipboard
- **host_permissions**: Access to `https://github.com/*`

## File Structure

```
copilot-review-to-prompt-extension/
├── manifest.json       # Extension configuration
├── content.js          # Main extraction logic
├── background.js       # Service worker for icon clicks
├── popup.html/js       # (Optional popup interface)
├── icons/              # Extension icons
├── test.html           # Local testing tool
├── README.md           # Full documentation
├── TROUBLESHOOTING.md  # Detailed debugging guide
├── CHANGELOG.md        # Version history
└── turbo-frame.html    # Reference HTML structure
```

## Version History

- **v1.1** (Current): Plain text extraction, improved line parsing
- **v1.0**: Initial release

## Support

- **Issues**: See `TROUBLESHOOTING.md`
- **Testing**: Use `test.html`
- **Debugging**: Check `FIX_SUMMARY.md`
- **Changes**: Read `CHANGELOG.md`

## Tips & Tricks

1. **Ignore suggestions** you don't want by clicking the ✗ button
2. **Selection persists** per-PR, so you can refresh and continue
3. **Works with GitHub Enterprise** (same selectors)
4. **Use Markdown format** to create GitHub issues
5. **Use JSON format** to build custom automation
6. **Refresh after scrolling** to detect lazily-loaded comments

## Example Workflow

1. Open PR: `https://github.com/user/repo/pull/123`
2. Copilot leaves 5 review comments
3. Click extension icon → Panel opens
4. Panel shows: "5 suggestions found, 5 selected"
5. Deselect 2 suggestions you'll handle manually
6. Click "Copy Prompt"
7. Open ChatGPT/Claude
8. Paste prompt
9. AI generates fixes for the 3 selected issues
10. Apply fixes to your code
11. Commit and push

## Need More Help?

- Read the full [README.md](README.md)
- Check [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for detailed solutions
- Review [FIX_SUMMARY.md](FIX_SUMMARY.md) to understand recent fixes
- Open an issue on the repository with debug info