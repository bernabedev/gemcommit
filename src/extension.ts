// src/extension.ts
import * as vscode from "vscode";
import { Content, GoogleGenerativeAI } from "@google/generative-ai";

/**
 * Activates the extension
 * @param context - The VS Code extension context
 */
export function activate(context: vscode.ExtensionContext): void {
  let disposable = vscode.commands.registerCommand(
    "gemcommit.suggestCommitMessage",
    async () => {
      try {
        const config = vscode.workspace.getConfiguration("gemcommit");
        const apiKey = config.get<string>("apiKey");

        if (!apiKey || apiKey.trim() === "") {
          vscode.window.showErrorMessage(
            "GemCommit: Please configure your Google Gemini API key in settings."
          );
          return;
        }

        const genAI = new GoogleGenerativeAI(apiKey);

        const gitExtension =
          vscode.extensions.getExtension("vscode.git")?.exports;
        if (!gitExtension) {
          vscode.window.showErrorMessage("Git extension not found");
          return;
        }

        const gitAPI = gitExtension.getAPI(1);
        const repository = gitAPI.repositories[0];

        if (!repository) {
          vscode.window.showErrorMessage("No Git repository found");
          return;
        }

        const stagedDiff = await repository.diff(true);

        if (!stagedDiff.trim()) {
          vscode.window.showInformationMessage("No staged changes found.");
          return;
        }

        const commitMessage = await generateCommitMessage(genAI, stagedDiff);

        // Insert commit message into the Source Control input box
        repository.inputBox.value = commitMessage.trim();

        vscode.window.showInformationMessage(
          "Commit message generated and inserted into Source Control input."
        );
      } catch (error: any) {
        vscode.window.showErrorMessage(
          `Error generating commit message: ${error.message}`
        );
      }
    }
  );

  context.subscriptions.push(disposable);

  // Add a button to Source Control UI with an icon
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "gemcommit.insertCommitMessage",
      async () => {
        vscode.commands.executeCommand("gemcommit.suggestCommitMessage");
      }
    )
  );

  vscode.commands.executeCommand("setContext", "scmProvider", "git");
}

/**
 * Generates a commit message using Gemini AI
 * @param changedFiles - List of changed file names
 * @returns A promise that resolves to a commit message
 */
async function generateCommitMessage(
  genAI: GoogleGenerativeAI,
  stagedDiff: string
): Promise<string> {
  const prompt = `Analyze the following git diff and generate a Conventional Commit message that accurately describes the changes made.
  - The message must be concise and informative, following the Conventional Commits format.
  - The commit message should not exceed 150 characters in the subject line.
  - Use imperative mood (e.g., "fix bug" instead of "fixed bug").
  - Include a scope if relevant (e.g., "feat(auth): add login validation").
  - If the commit fixes a bug, use "fix".
  - If the commit introduces a new feature, use "feat".
  - If the commit includes refactoring, use "refactor".
  - If the commit adds tests, use "test".
  - If the commit updates documentation, use "docs".
  - Do not include unnecessary details; keep it clear and to the point.
  
  Here is the git diff:
  
  ${stagedDiff}`;

  const contents: Content[] = [{ role: "user", parts: [{ text: prompt }] }];
  const config = vscode.workspace.getConfiguration("gemcommit");
  const modelName = config.get<string>("model") ?? "gemini-1.5-flash";

  try {
    const model = genAI.getGenerativeModel({ model: modelName });
    const { response } = await model.generateContent({ contents });
    return response.text();
  } catch (error) {
    console.error("Gemini AI Error:", error);
    return "chore: update files";
  }
}

export function deactivate(): void {}
