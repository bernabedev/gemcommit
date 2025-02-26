# 🚀 GemCommit - AI-Powered Conventional Commit Generator

**GemCommit** is a VS Code extension that generates commit messages automatically using **Google Gemini AI**, following the **Conventional Commits** specification.

## ✨ Features

- 🔥 **AI-powered commit message generation** based on staged changes.
- 📝 **Follows Conventional Commits** (`feat`, `fix`, `docs`, `chore`, etc.).
- ⚡ **One-click commit message insertion** in the Source Control input.
- 🖊️ **Detailed commit messages** with body and breaking changes support.
- 📜 **Commit history tracking** for easy reuse of previous messages.
- 🌐 **Supports customization of AI model and API key** in settings.
- 🎨 **Seamless integration with VS Code's Source Control UI.**

## 📸 Screenshots

![GemCommit in Action] <!-- (images/gemcommit-demo.gif) -->

## 📦 Requirements

- **VS Code** `^1.97.0`
- **Google Gemini AI API Key** (see [Setup](#-setup))

## ⚙️ Setup

1. Get a **Google Gemini API Key** from [Google AI Studio](https://aistudio.google.com/).
2. Open **VS Code Settings** (`Ctrl + ,` or `Cmd + ,` on Mac).
3. Search for `GemCommit`.
4. Add your API Key in `gemcommit.apiKey`.

## 🔧 Extension Settings

| Setting                          | Description                                                   |
|----------------------------------|---------------------------------------------------------------|
| `gemcommit.apiKey`               | API key for Google Gemini AI.                                |
| `gemcommit.model`                | AI model for generating commit messages.                     |
| `gemcommit.customPrompt`         | Custom prompt template for commit messages.                  |
| `gemcommit.promptBeforeInsert`   | Enables review before inserting commit messages.             |
| `gemcommit.maxHistorySize`       | Maximum number of commit messages stored in history.         |
| `gemcommit.includeProjectContext`| Includes project details (e.g., package.json) in AI prompts. |

## 🛠 Commands

| Command                                  | Description                                             |
|------------------------------------------|---------------------------------------------------------|
| `GemCommit: Generate Commit Message`     | Generates a Conventional Commit message.               |
| `GemCommit: Generate Detailed Commit Message` | Generates a detailed commit with body & scope.  |
| `GemCommit: Show Commit History`         | Displays previous commit messages for reuse.           |

## 🛠 Known Issues

- No known issues. Feel free to report any [here](https://github.com/bernabedev/gemcommit/issues).

## 📌 Release Notes

### 1.0.0

- Initial release with AI-powered commit message generation.
- VS Code Source Control integration.
- Conventional Commits support.
- Commit history tracking.
- Review before inserting commit messages.

## 📜 Following Extension Guidelines

Make sure to follow the official [VS Code Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines) for best practices.

## 🎯 Contribution

Contributions are welcome! Fork the repo and submit a PR [here](https://github.com/bernabedev/gemcommit).

---

🔗 **More Information:**

- [VS Code's Markdown Support](http://code.visualstudio.com/docs/languages/markdown)
- [Markdown Syntax Reference](https://help.github.com/articles/markdown-basics/)