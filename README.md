# Copilot Review to Prompt

**Copilot Review to Prompt** is a browser extension that helps you turn GitHub Copilot code review comments into actionable prompts for Large Language Models (LLMs).

[**Visit the Project Website**](https://tomberman.github.io/copilot-review-to-prompt-extension/)

## Overview

Managing automated code reviews can be overwhelming. When GitHub Copilot leaves feedback across multiple files in a Pull Request, manually aggregating that context to ask an AI for a fix is time-consuming.

This extension scrapes the review comments directly from the PR page and formats them into a structured prompt. You can then copy this prompt into ChatGPT, Claude, or any other LLM to generate code fixes instantly.

## Recent Improvements

- **Enhanced Plain Text Extraction**: Now correctly extracts Copilot review comments written as plain paragraph text, not just structured lists or code blocks
- **Improved Line Number Detection**: Properly handles GitHub's "Comment on lines +67 to +87" format with plus signs
- **Better Selector Coverage**: Added support for `.js-multi-line-preview-start` and `.js-multi-line-preview-end` span elements
- **Fallback Handling**: When no structured suggestions are found, the extension now captures the entire review comment text

## Key Features

*   **Smart Extraction**: Automatically identifies review comments from GitHub Copilot.
*   **Rich Context**: Extracts file paths, line numbers, code snippets, and specific suggestions.
*   **Flexible Output**:
    *   **Prompt Mode**: Optimized for pasting into AI chat interfaces.
    *   **Markdown Mode**: Great for creating issue tickets or documentation.
    *   **JSON Mode**: For developers who want to process the data further.
*   **Local Processing**: All data extraction happens locally in your browser.

## Installation

### Manual Installation (Developer Mode)

1.  Clone this repository to your local machine.
2.  Open Chrome and navigate to `chrome://extensions/`.
3.  Enable **Developer mode** in the top right corner.
4.  Click **Load unpacked**.
5.  Select the `copilot-review-to-prompt-extension` directory.

## How to Use

1.  Navigate to a Pull Request on GitHub that has Copilot reviews.
2.  Click the extension icon in your browser toolbar (or look for the on-page floating button if configured).
3.  A panel will open displaying the detected suggestions.
4.  Select the items you want to include.
5.  Click **Copy Prompt** and paste it into your AI assistant.

## Documentation

- **[Quick Reference](QUICK_REFERENCE.md)** - Fast setup and usage guide
- **[Troubleshooting Guide](TROUBLESHOOTING.md)** - Debug common issues
- **[Changelog](CHANGELOG.md)** - Version history and updates
- **[Fix Summary](FIX_SUMMARY.md)** - Details on recent bug fixes
- **[Test Page](test.html)** - Local testing tool for extraction logic

## Testing

A `test.html` file is included to verify the extension works correctly:

1. Open `test.html` in your browser
2. Tests run automatically on page load
3. Verify all extraction functions work as expected
4. Compare results with actual GitHub PR behavior

This is useful for:
- Verifying the extension after installation
- Debugging extraction issues
- Testing after GitHub UI changes

## Troubleshooting

If the extension isn't detecting suggestions:

1. Verify you're on a GitHub Pull Request page (URL matches `github.com/*/pull/*`)
2. Check that Copilot has left review comments (look for "Copilot" user with AI badge)
3. Try clicking the Refresh button in the panel
4. Open browser console (F12) and check for errors
5. See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for detailed solutions

## Contributing

Contributions are welcome! When reporting issues, please include:
- Browser version and extension version
- Steps to reproduce the issue
- Console errors (if any)
- Whether `test.html` works correctly

## License

MIT