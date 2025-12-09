---
layout: default
---

# Copilot Review to Prompt

**Copilot Review to Prompt** is a browser extension that helps you turn GitHub Copilot code review comments into actionable prompts for Large Language Models (LLMs).

## Overview

Managing automated code reviews can be overwhelming. When GitHub Copilot leaves feedback across multiple files in a Pull Request, manually aggregating that context to ask an AI for a fix is time-consuming. 

This extension solves that problem by scraping the review comments directly from the PR page and formatting them into a structured prompt. You can then copy this prompt into ChatGPT, Claude, or any other LLM to generate code fixes instantly.

## Key Features

*   **Smart Extraction**: Automatically identifies review comments from GitHub Copilot.
*   **Rich Context**: Extracts file paths, line numbers, code snippets, and specific suggestions.
*   **Flexible Output**:
    *   **Prompt Mode**: Optimized for pasting into AI chat interfaces.
    *   **Markdown Mode**: Great for creating issue tickets or documentation.
    *   **JSON Mode**: For developers who want to process the data further.
*   **Local Processing**: All data extraction happens locally in your browser. No code or comments are sent to third-party servers by the extension itself.

## How to Use

1.  Open a Pull Request on GitHub.
2.  Click the **Copilot Review to Prompt** extension icon (or the floating button on the page).
3.  A panel will appear listing all detected Copilot suggestions.
4.  Select the suggestions you want to address.
5.  Click **Copy Prompt** and paste it into your LLM of choice.

## Installation

### Chrome Web Store
*(Coming Soon)*

### Manual Installation (Developer Mode)
1.  Clone the repository.
2.  Open `chrome://extensions/` in Chrome.
3.  Enable "Developer mode".
4.  Click "Load unpacked" and select the extension directory.

## License

This project is licensed under the MIT License.

[View on GitHub](https://github.com/tomberman/copilot-review-to-prompt-extension)