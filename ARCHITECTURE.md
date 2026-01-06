# Architecture Documentation

## System Overview

The Copilot Review to Prompt extension is a Chrome browser extension that extracts GitHub Copilot review comments from Pull Request pages and formats them into structured prompts for AI assistants.

## Component Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Chrome Browser                            │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                GitHub PR Page                          │  │
│  │  ┌──────────────────────────────────────────────┐     │  │
│  │  │  <turbo-frame id="review-thread-...">        │     │  │
│  │  │    ├── File path: lib/example.ex             │     │  │
│  │  │    ├── Line range: 67-87                     │     │  │
│  │  │    ├── Code snippet (table.diff-table)       │     │  │
│  │  │    └── Comment (div.js-comment)              │     │  │
│  │  │         ├── Author: Copilot (a.author)       │     │  │
│  │  │         └── Body: (.js-comment-body)         │     │  │
│  │  └──────────────────────────────────────────────┘     │  │
│  │                       │                                │  │
│  │                       ▼                                │  │
│  │  ┌──────────────────────────────────────────────┐     │  │
│  │  │         Content Script (content.js)          │     │  │
│  │  │  ┌────────────────────────────────────────┐  │     │  │
│  │  │  │   DOM Extraction Functions             │  │     │  │
│  │  │  │   • findFilePathInFrame()              │  │     │  │
│  │  │  │   • findLineRangeInFrame()             │  │     │  │
│  │  │  │   • findCodeMentionedInFrame()         │  │     │  │
│  │  │  │   • isCopilotAuthor()                  │  │     │  │
│  │  │  │   • extractReviewTextOnly()            │  │     │  │
│  │  │  │   • extractSuggestionsFromComment()    │  │     │  │
│  │  │  └────────────────────────────────────────┘  │     │  │
│  │  │                   │                           │     │  │
│  │  │                   ▼                           │     │  │
│  │  │  ┌────────────────────────────────────────┐  │     │  │
│  │  │  │   State Management                     │  │     │  │
│  │  │  │   • suggestions[]                      │  │     │  │
│  │  │  │   • deselected Set (localStorage)      │  │     │  │
│  │  │  │   • ignored Set (localStorage)         │  │     │  │
│  │  │  └────────────────────────────────────────┘  │     │  │
│  │  │                   │                           │     │  │
│  │  │                   ▼                           │     │  │
│  │  │  ┌────────────────────────────────────────┐  │     │  │
│  │  │  │   UI Component (Shadow DOM)            │  │     │  │
│  │  │  │   • Floating panel overlay             │  │     │  │
│  │  │  │   • Checkbox list for suggestions      │  │     │  │
│  │  │  │   • Copy buttons (Prompt/MD/JSON)      │  │     │  │
│  │  │  │   • Select All / Refresh controls      │  │     │  │
│  │  │  └────────────────────────────────────────┘  │     │  │
│  │  │                   │                           │     │  │
│  │  │                   ▼                           │     │  │
│  │  │  ┌────────────────────────────────────────┐  │     │  │
│  │  │  │   Output Builders                      │  │     │  │
│  │  │  │   • buildPrompt()  → AI-optimized      │  │     │  │
│  │  │  │   • buildMarkdown() → Documentation    │  │     │  │
│  │  │  │   • buildJSON() → Programmatic         │  │     │  │
│  │  │  └────────────────────────────────────────┘  │     │  │
│  │  └──────────────────────────────────────────────┘     │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │   Background Service Worker (background.js)           │  │
│  │   • Listens for extension icon clicks                 │  │
│  │   • Sends messages to content script                  │  │
│  │   • Handles CRTP_TOGGLE_PANEL, CRTP_REFRESH           │  │
│  └───────────────────────────────────────────────────────┘  │
│                          ▲                                   │
│                          │                                   │
│  ┌───────────────────────┴───────────────────────────────┐  │
│  │         Chrome Extension API                          │  │
│  │   • chrome.runtime.onMessage                          │  │
│  │   • chrome.action.onClicked                           │  │
│  │   • navigator.clipboard.writeText                     │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Page Load & Initialization

```
GitHub PR Page Loads
        ↓
content.js injected (manifest.json)
        ↓
Check if PR page: isPRPage()
        ↓
Mount UI in Shadow DOM: UI.mount()
        ↓
Start observing DOM: bodyObserver
        ↓
Extract suggestions: extractAllSuggestions()
        ↓
Render panel: UI.render()
```

### 2. Extraction Pipeline

```
extractAllSuggestions()
        ↓
Find all turbo-frames: document.querySelectorAll('turbo-frame[id^="review-thread"]')
        ↓
For each frame:
   ├── findCommentRootsInTurboFrame()
   │   └── Find: article, .js-comment, div[id^="discussion_r"]
   │
   ├── For each comment:
   │   ├── isCopilotAuthor()
   │   │   ├── Check a.author text
   │   │   ├── Check href for "copilot"
   │   │   └── Check for "bot" badges
   │   │
   │   ├── extractSuggestionsFromComment()
   │   │   ├── extractListItems() → ul/ol li items
   │   │   ├── extractPatternLines() → "Suggestion:", "Fix:", etc.
   │   │   ├── extractSuggestedChangeBlocks() → code diffs
   │   │   └── Fallback: plain text if empty
   │   │
   │   └── Build context:
   │       ├── findFilePathInFrame()
   │       │   ├── details-collapsible summary a
   │       │   ├── [data-path] attribute
   │       │   └── a.Link--primary
   │       │
   │       ├── findLineRangeInFrame()
   │       │   ├── .js-multi-line-preview-start/end
   │       │   ├── [data-line-number]
   │       │   ├── .blob-num
   │       │   └── Parse text: "Lines X-Y" or "on lines +X to +Y"
   │       │
   │       ├── findCodeMentionedInFrame()
   │       │   └── Extract from table.diff-table
   │       │
   │       ├── extractReviewTextOnly()
   │       │   └── Clone body, remove code/tables, extract text
   │       │
   │       └── extractPrimarySuggestedChange()
   │           └── First code block or diff
   │
   └── Create suggestion object:
       {
         id: hash-based unique ID,
         text: suggestion text,
         summary: truncated text,
         sourceUrl: comment permalink,
         isCopilot: boolean,
         filePath: string | null,
         lineStart: number | null,
         lineEnd: number | null,
         codeMentioned: string | null,
         reviewText: string | null,
         suggestedChange: string | null
       }
```

### 3. User Interaction Flow

```
User clicks extension icon
        ↓
background.js: chrome.action.onClicked
        ↓
Send message: { type: "CRTP_TOGGLE_PANEL" }
        ↓
content.js: chrome.runtime.onMessage
        ↓
UI.togglePanel() / UI.openPanel()
        ↓
Panel becomes visible
        ↓
User selects/deselects suggestions
        ↓
Update deselected Set
        ↓
Save to localStorage
        ↓
User clicks "Copy Prompt"
        ↓
buildPrompt(selectedSuggestions)
        ↓
navigator.clipboard.writeText(prompt)
        ↓
Show status message
```

## Key Design Decisions

### 1. Shadow DOM for UI
- **Why**: Isolates extension styles from GitHub's CSS
- **Benefit**: No conflicts, consistent appearance
- **Implementation**: `shadowHost.attachShadow({ mode: "open" })`

### 2. localStorage for State
- **Why**: Persist selection across page reloads
- **Benefit**: User doesn't lose work
- **Key**: `copilot-review-to-prompt:${origin}${pathname}:deselected`

### 3. MutationObserver for Dynamic Content
- **Why**: GitHub loads comments dynamically
- **Benefit**: Captures late-loaded content
- **Implementation**: Debounced observer on document.body

### 4. Multiple Output Formats
- **Prompt**: Optimized for AI chat interfaces
- **Markdown**: For GitHub issues/documentation
- **JSON**: For automation/scripting

### 5. Best-Effort Extraction
- **Philosophy**: Better to capture too much than miss content
- **Fallbacks**: Multiple selectors for each data point
- **Strategy**: If Copilot detected → filter to Copilot, else show all

## Selector Strategy

### Priority-Based Extraction

Each extraction function uses multiple selectors in priority order:

```javascript
findFilePathInFrame():
  1. details-collapsible summary a         // Most specific
  2. [data-path]                           // Attribute-based
  3. a.js-file-link, a.Link--primary       // Class-based
  4. [title*="/"], [aria-label*="/"]       // Attribute search
```

This provides resilience against GitHub DOM changes.

## Performance Considerations

### 1. Debouncing
- DOM observation debounced by 250ms
- Prevents excessive re-extraction during dynamic loading

### 2. Incremental Processing
- Extract per-frame, not entire page at once
- Allows early termination if needed

### 3. Set-Based Deduplication
- Uses hash-based IDs for O(1) lookup
- Deselected/ignored stored as Sets, not arrays

### 4. Lazy Rendering
- Panel only renders when opened
- List items rendered on-demand

## Security & Privacy

### 1. No External Requests
- All processing happens locally
- No data sent to external servers

### 2. Minimal Permissions
- Only `clipboardWrite` for copying
- Host permissions limited to `github.com`

### 3. localStorage Only
- No cookies, no server-side storage
- Data stays in browser

### 4. Content Script Isolation
- Runs in isolated JavaScript context
- Cannot interfere with page scripts

## Error Handling

### 1. Try-Catch Blocks
- All extraction functions wrapped
- Graceful degradation on failure

### 2. Null Checks
- Every DOM query checked for null
- Safe defaults (empty strings, null values)

### 3. Regex Safeguards
- Non-capturing groups where possible
- NaN checks after parseInt()

### 4. Message Handling
- Response checks for chrome.runtime.lastError
- Timeout handling in background.js

## Extension Lifecycle

```
Install/Update
     ↓
manifest.json loaded
     ↓
background.js: Service Worker registered
     ↓
User navigates to GitHub PR
     ↓
content.js injected automatically
     ↓
Initialization:
  ├── Check isPRPage()
  ├── Load storage (deselected, ignored)
  ├── Mount UI (Shadow DOM)
  ├── Start bodyObserver
  └── Extract initial suggestions
     ↓
Ready (waiting for user action)
     ↓
User clicks icon / panel button
     ↓
Process action (extract, copy, etc.)
     ↓
User navigates away
     ↓
Content script context destroyed
     ↓
(Service Worker remains idle)
```

## Testing Architecture

### Unit Testing (Manual via test.html)
- Simulates GitHub PR HTML structure
- Tests each extraction function independently
- Validates selectors and parsing logic

### Integration Testing (On actual PR)
- Load extension in developer mode
- Navigate to real PR with Copilot comments
- Verify all functions work end-to-end

### Console Testing
- `window.__CRTP__` provides programmatic access
- Can manually test functions via console
- Useful for debugging specific PRs

## Future Extensibility

### Adding New Extraction Patterns
1. Add selector to appropriate function
2. Test with `test.html`
3. Verify on actual GitHub PR
4. Update documentation

### Supporting New GitHub Features
1. Inspect new DOM structure
2. Add new selectors with fallbacks
3. Maintain backward compatibility
4. Add tests for new pattern

### Adding Output Formats
1. Create new `buildXXX()` function
2. Follow existing pattern (map over suggestions)
3. Add button to UI
4. Update documentation

## Dependencies

### Runtime
- **Chrome Extension API** (Manifest V3)
- **Web APIs**: DOM, localStorage, Clipboard API
- **ES6+**: Arrow functions, template literals, destructuring

### Development
- **None** - Pure JavaScript, no build step required

### Browser Requirements
- Chrome 88+ (Manifest V3 support)
- Edge 88+ (Chromium-based)
- Brave (Chromium-based)