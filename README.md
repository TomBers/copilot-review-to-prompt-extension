# Copilot Review to Prompt

**Copilot Review to Prompt** is a browser extension that helps you turn GitHub Copilot code review comments into actionable prompts for Large Language Models (LLMs).

[**Visit the Project Website**](https://tomberman.github.io/copilot-review-to-prompt-extension/)

## Overview

Managing automated code reviews can be overwhelming. When GitHub Copilot leaves feedback across multiple files in a Pull Request, manually aggregating that context to ask an AI for a fix is time-consuming.

This extension scrapes the review comments directly from the PR page and formats them into a structured prompt. You can then copy this prompt into ChatGPT, Claude, or any other LLM to generate code fixes instantly.

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

## License

MIT