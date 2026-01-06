# Changelog

All notable changes to the Copilot Review to Prompt extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-01-06

### Added
- Support for extracting plain paragraph text from Copilot review comments
- Enhanced line number extraction for GitHub's "Comment on lines +X to +Y" format
- Detection of `.js-multi-line-preview-start` and `.js-multi-line-preview-end` span elements
- Test HTML page (`test.html`) for verifying extraction functionality locally
- Fallback mechanism to capture entire comment text when no structured suggestions are found

### Fixed
- Line number extraction now properly handles plus signs (e.g., "+67" instead of "67")
- Extraction now works with Copilot comments written as plain paragraphs without bullet points or explicit "Suggestion:" prefixes
- Improved regex pattern to match both "Lines X-Y" and "Comment on lines +X to +Y" formats

### Changed
- Updated `findLineRangeInFrame()` to strip leading "+" from line numbers in both span text and blob-num cells
- Enhanced `extractSuggestionsFromComment()` to include plain text as a suggestion when no structured items are found
- Improved pattern matching for "on lines" format in addition to "Lines" format

## [1.0.0] - Initial Release

### Added
- Initial release of Copilot Review to Prompt extension
- Extract GitHub Copilot review comments from PR pages
- Support for multiple output formats (Prompt, Markdown, JSON)
- Selection/deselection of individual suggestions
- Persistent state per-PR using localStorage
- Shadow DOM UI for non-invasive panel overlay
- Automatic detection of Copilot-authored comments
- Extraction of file paths, line ranges, code snippets, and suggestions
- Background service worker for browser action handling
- Clipboard write support for copying prompts