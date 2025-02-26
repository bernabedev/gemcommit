import { Content, GoogleGenerativeAI } from "@google/generative-ai";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

// Interface for storing configurations
interface CommitConfiguration {
  type: string;
  scope?: string;
  description: string;
  body?: string;
  breakingChanges?: boolean;
}

/**
 * Activates the extension
 * @param context - The VS Code extension context
 */
export function activate(context: vscode.ExtensionContext): void {
  // Register the main command
  let disposable = vscode.commands.registerCommand(
    "gemcommit.suggestCommitMessage",
    async () => {
      try {
        const config = vscode.workspace.getConfiguration("gemcommit");
        const apiKey = config.get<string>("apiKey");

        if (!apiKey || apiKey.trim() === "") {
          // Offer to open the settings
          const openSettings = "Open Settings";
          const result = await vscode.window.showErrorMessage(
            "GemCommit: Please configure your Google Gemini API key in settings.",
            openSettings
          );
          if (result === openSettings) {
            vscode.commands.executeCommand(
              "workbench.action.openSettings",
              "gemcommit.apiKey"
            );
          }
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

        // Show progress indicator
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Generating commit message...",
            cancellable: false,
          },
          async () => {
            const stagedDiff = await repository.diff(true);

            if (!stagedDiff.trim()) {
              vscode.window.showInformationMessage("No staged changes found.");
              return;
            }

            // Add additional project context
            const projectContext = await getProjectContext();

            // Generate message with more context
            const commitMessage = await generateCommitMessage(
              genAI,
              stagedDiff,
              projectContext
            );

            // Allow editing before inserting
            const shouldEdit = config.get<boolean>("promptBeforeInsert") ?? false;
            if (shouldEdit) {
              const editedMessage = await vscode.window.showInputBox({
                prompt: "Review and edit the commit message if needed",
                value: commitMessage,
                placeHolder: "Review generated commit message",
              });

              if (editedMessage) {
                repository.inputBox.value = editedMessage.trim();
              }
            } else {
              repository.inputBox.value = commitMessage.trim();
            }

            // Save to history
            saveToCommitHistory(commitMessage, context);

            vscode.window.showInformationMessage(
              "Commit message generated and inserted into Source Control input."
            );
          }
        );
      } catch (error: any) {
        vscode.window.showErrorMessage(
          `Error generating commit message: ${error.message}`
        );
      }
    }
  );

  context.subscriptions.push(disposable);

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "gemcommit.insertCommitMessage",
      async () => {
        vscode.commands.executeCommand("gemcommit.suggestCommitMessage");
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "gemcommit.detailedCommitMessage",
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

          const projectContext = await getProjectContext();
          const commitConfig = await generateDetailedCommit(genAI, stagedDiff, projectContext);
          
          const commitMessage = await showCommitEditor(commitConfig);
          if (commitMessage) {
            repository.inputBox.value = commitMessage;
          }
        } catch (error: any) {
          console.error("Error generating detailed commit message:", error);
          vscode.window.showErrorMessage(
            `Error generating detailed commit message: ${error.message}`
          );
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "gemcommit.showCommitHistory",
      async () => {
        showCommitHistory(context);
      }
    )
  );

  vscode.commands.executeCommand("setContext", "scmProvider", "git");
}

/**
 * Gets additional project context
 */
async function getProjectContext(): Promise<string> {
  try {
    // Get the package.json file if it exists
    const rootPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    if (!rootPath) {return "";}

    let projectInfo = "";
    const packageJsonPath = path.join(rootPath, "package.json");
    
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
      projectInfo += `Project name: ${packageJson.name}\n`;
      projectInfo += `Description: ${packageJson.description || "Not available"}\n`;
      projectInfo += `Dependencies: ${Object.keys(packageJson.dependencies || {}).join(", ")}\n`;
    }

    // Get the last commit
    const gitExtension = vscode.extensions.getExtension("vscode.git")?.exports;
    if (gitExtension) {
      const gitAPI = gitExtension.getAPI(1);
      const repository = gitAPI.repositories[0];
      if (repository) {
        const lastCommit = await repository.log({ maxEntries: 1 });
        if (lastCommit && lastCommit.length > 0) {
          projectInfo += `Last commit: ${lastCommit[0].message}\n`;
        }
      }
    }

    return projectInfo;
  } catch (error) {
    console.error("Error getting project context:", error);
    return "";
  }
}

/**
 * Generates a commit message using Gemini AI with additional context
 */
async function generateCommitMessage(
  genAI: GoogleGenerativeAI,
  stagedDiff: string,
  projectContext: string
): Promise<string> {
  const config = vscode.workspace.getConfiguration("gemcommit");
  const customPrompt = config.get<string>("customPrompt") || "";
  
  const prompt = `${customPrompt || `Analyze the following git diff and generate a Conventional Commit message that accurately describes the changes made.
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
  - Return ONLY the commit message text, without formatting, backticks, or extra characters.`}
  
  ${projectContext ? `\n\nProject context:\n${projectContext}` : ""}
  
  Here is the git diff:
  
  ${stagedDiff}`;

  const contents: Content[] = [{ role: "user", parts: [{ text: prompt }] }];
  const modelName = config.get<string>("model") ?? "gemini-2.0-flash";

  try {
    const model = genAI.getGenerativeModel({ model: modelName });
    const { response } = await model.generateContent({ contents });
    return response.text();
  } catch (error) {
    console.error("Gemini AI Error:", error);
    throw error;
  }
}

/**
 * Generates a detailed commit with title, body, and breaking changes
 */
async function generateDetailedCommit(
  genAI: GoogleGenerativeAI,
  stagedDiff: string,
  projectContext: string
): Promise<CommitConfiguration> {
  const prompt = `Analyze the following git diff and generate a detailed Conventional Commit message with the following parts:
  1. Type (e.g., feat, fix, refactor, docs, style, test, etc.)
  2. Scope (optional, in parentheses)
  3. Short description
  4. Detailed body explaining the changes
  5. Note any breaking changes
  
  Return the result in JSON format with the following properties:
  {
    "type": "feat|fix|refactor|docs|style|test|...",
    "scope": "optional scope",
    "description": "short description",
    "body": "detailed explanation",
    "breakingChanges": boolean
  }
  
  IMPORTANT: Return ONLY the raw JSON without any Markdown formatting, code blocks, backticks, or explanation text. The response should start with '{' and end with '}'.
  
  ${projectContext ? `\n\nProject context:\n${projectContext}` : ""}
  
  Here is the git diff:
  
  ${stagedDiff}`;

  const contents: Content[] = [{ role: "user", parts: [{ text: prompt }] }];
  const config = vscode.workspace.getConfiguration("gemcommit");
  const modelName = config.get<string>("model") ?? "gemini-1.5-flash";

  try {
    const model = genAI.getGenerativeModel({ model: modelName });
    const { response } = await model.generateContent({ contents });
    const responseText = response.text();

    let jsonText = responseText;
    
    if (responseText.includes("```")) {
      const match = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (match && match[1]) {
        jsonText = match[1].trim();
      }
    }
    
    // Get JSON object
    const startIndex = jsonText.indexOf('{');
    const endIndex = jsonText.lastIndexOf('}') + 1;
    
    if (startIndex !== -1 && endIndex > startIndex) {
      jsonText = jsonText.substring(startIndex, endIndex);
    }
    
    try {
      return JSON.parse(jsonText) as CommitConfiguration;
    } catch (parseError) {
      console.error("JSON parse error:", parseError);
      console.error("Attempted to parse:", jsonText);
      
      // Return a default commit if parsing fails
      return {
        type: "feat",
        description: "automated commit message",
        body: "Could not parse AI response, but changes were detected in: " + 
              stagedDiff.split('\n').filter(line => line.startsWith('diff --git')).join(', '),
        breakingChanges: false
      };
    }
  } catch (error) {
    console.error("Gemini AI Error:", error);
    throw error;
  }
}

/**
 * Displays an editor to modify the detailed commit
 */
async function showCommitEditor(commitConfig: CommitConfiguration): Promise<string | undefined> {
  try {
    if (!commitConfig.type || !commitConfig.description) {
      console.error("Invalid commit config received:", commitConfig);
      vscode.window.showErrorMessage("Error: Received invalid commit data from AI.");
      
      commitConfig = {
        type: commitConfig.type || "feat",
        scope: commitConfig.scope,
        description: commitConfig.description || "automated commit message",
        body: commitConfig.body || "",
        breakingChanges: !!commitConfig.breakingChanges
      };
    }
    
    // Create a new webview panel
    const panel = vscode.window.createWebviewPanel(
      "gemcommitEditor",
      "Edit Commit Message",
      vscode.ViewColumn.One,
      { enableScripts: true }
    );

    // Escape values to prevent HTML issues
    const escapeHtml = (str: string) => str.replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

    panel.webview.html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Edit Commit Message</title>
        <style>
          body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background-color: var(--vscode-editor-background); padding: 20px; }
          label { display: block; margin-top: 10px; color: var(--vscode-foreground); }
          input, textarea { width: 100%; padding: 5px; margin-bottom: 10px; background-color: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); }
          button { padding: 8px 16px; margin-right: 10px; cursor: pointer; background-color: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; }
          button:hover { background-color: var(--vscode-button-hoverBackground); }
          pre { background-color: var(--vscode-textBlockQuote-background); padding: 10px; border-radius: 4px; }
        </style>
      </head>
      <body>
        <h2>Edit Conventional Commit</h2>
        <form id="commitForm">
          <div style="display: flex; gap: 10px;">
            <div style="flex: 1;">
              <label for="type">Type:</label>
              <input type="text" id="type" value="${escapeHtml(commitConfig.type)}" required>
            </div>
            <div style="flex: 1;">
              <label for="scope">Scope (optional):</label>
              <input type="text" id="scope" value="${escapeHtml(commitConfig.scope || '')}">
            </div>
          </div>
          
          <label for="description">Description:</label>
          <input type="text" id="description" value="${escapeHtml(commitConfig.description)}" required>
          
          <label for="body">Body:</label>
          <textarea id="body" rows="5">${escapeHtml(commitConfig.body || '')}</textarea>
          
          <div>
            <input type="checkbox" id="breaking" ${commitConfig.breakingChanges ? 'checked' : ''}>
            <label for="breaking" style="display: inline;">Breaking Changes</label>
          </div>
          
          <h3>Preview:</h3>
          <pre id="preview" style="white-space: pre-wrap;"></pre>
          
          <div style="margin-top: 20px;">
            <button type="submit">Apply</button>
            <button type="button" id="cancelBtn">Cancel</button>
          </div>
        </form>
        
        <script>
          const typeInput = document.getElementById('type');
          const scopeInput = document.getElementById('scope');
          const descriptionInput = document.getElementById('description');
          const bodyInput = document.getElementById('body');
          const breakingInput = document.getElementById('breaking');
          const previewElement = document.getElementById('preview');
          
          function updatePreview() {
            const type = typeInput.value;
            const scope = scopeInput.value ? \`(\${scopeInput.value})\` : '';
            const breaking = breakingInput.checked ? '!' : '';
            const description = descriptionInput.value;
            const body = bodyInput.value;
            
            let preview = \`\${type}\${scope}\${breaking}: \${description}\`;
            if (body) {
              preview += \`\\n\\n\${body}\`;
            }
            
            // Añadir pie de página para BREAKING CHANGE si está marcado
            if (breakingInput.checked && !body.toLowerCase().includes('breaking change')) {
              preview += \`\\n\\nBREAKING CHANGE: This commit introduces breaking changes.\`;
            }
            
            previewElement.textContent = preview;
          }
          
          // Update preview on input changes
          [typeInput, scopeInput, descriptionInput, bodyInput, breakingInput].forEach(input => {
            input.addEventListener('input', updatePreview);
          });
          
          // Initial preview
          updatePreview();
          
          // Form submission
          document.getElementById('commitForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const vscode = acquireVsCodeApi();
            vscode.postMessage({
              command: 'applyCommit',
              commitMessage: previewElement.textContent
            });
          });
          
          // Cancel button
          document.getElementById('cancelBtn').addEventListener('click', () => {
            const vscode = acquireVsCodeApi();
            vscode.postMessage({
              command: 'cancel'
            });
          });
        </script>
      </body>
      </html>
    `;

    
    return new Promise((resolve) => {
      panel.webview.onDidReceiveMessage(
        message => {
          if (message.command === 'applyCommit') {
            resolve(message.commitMessage);
            panel.dispose();
          } else if (message.command === 'cancel') {
            resolve(undefined);
            panel.dispose();
          }
        },
        undefined,
        []
      );
    });
  } catch (error) {
    console.error("Error displaying commit editor:", error);
    vscode.window.showErrorMessage(`Error displaying commit editor: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

/**
 * Saves a generated commit to the history
 */

function saveToCommitHistory(commitMessage: string, context: vscode.ExtensionContext): void {
  try {
    const history = context.globalState.get<string[]>("commitHistory", []);
    
    const updatedHistory = [commitMessage, ...history.slice(0, 19)]; // Mantener últimos 20
    
    context.globalState.update("commitHistory", updatedHistory);
  } catch (error) {
    console.error("Error saving to commit history:", error);
  }
}

/**
 * Displays the history of generated commits
 */
async function showCommitHistory(context: vscode.ExtensionContext): Promise<void> {
  const history = context.globalState.get<string[]>("commitHistory", []);
  
  if (history.length === 0) {
    vscode.window.showInformationMessage("No commit history available yet.");
    return;
  }
  
  const selectedCommit = await vscode.window.showQuickPick(history, {
    placeHolder: "Select a commit message to reuse"
  });
  
  if (selectedCommit) {
    const gitExtension = vscode.extensions.getExtension("vscode.git")?.exports;
    if (gitExtension) {
      const gitAPI = gitExtension.getAPI(1);
      const repository = gitAPI.repositories[0];
      if (repository) {
        repository.inputBox.value = selectedCommit;
        vscode.window.showInformationMessage("Commit message inserted from history.");
      }
    }
  }
}

export function deactivate(): void {}