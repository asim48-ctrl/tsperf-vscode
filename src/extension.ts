import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import ts from "typescript";

type InspectionResult = {
  fileName: string;
  position: number;
  elapsedMs: number;
  typeText: string;
  complexityScore: number;
  complexitySignals: string[];
};

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand(
    "tsperf.inspectTypeAtCursor",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage("Open a TypeScript file first.");
        return;
      }

      const result = inspectEditorType(editor);
      if (!result) {
        return;
      }

      const panel = vscode.window.createWebviewPanel(
        "tsperf",
        "TSPerf",
        vscode.ViewColumn.Beside,
        { enableScripts: false },
      );
      panel.webview.html = renderResult(result);
    },
  );

  context.subscriptions.push(disposable);
}

export function deactivate() {}

function inspectEditorType(editor: vscode.TextEditor): InspectionResult | null {
  const document = editor.document;
  if (
    document.languageId !== "typescript" &&
    document.languageId !== "typescriptreact"
  ) {
    vscode.window.showWarningMessage("TSPerf only inspects TypeScript files.");
    return null;
  }

  const maxFileSizeKb = vscode.workspace
    .getConfiguration("tsperf")
    .get<number>("maxFileSizeKb", 512);
  const sourceText = document.getText();
  if (Buffer.byteLength(sourceText, "utf8") > maxFileSizeKb * 1024) {
    vscode.window.showWarningMessage(
      `File exceeds TSPerf size limit (${maxFileSizeKb}KB).`,
    );
    return null;
  }

  const fileName = document.fileName;
  const position = document.offsetAt(editor.selection.active);
  const service = createLanguageService(fileName, sourceText);

  const started = performance.now();
  const quickInfo = service.getQuickInfoAtPosition(fileName, position);
  const elapsedMs = performance.now() - started;

  const typeText = quickInfo
    ? ts.displayPartsToString(quickInfo.displayParts)
    : "No TypeScript type information available at cursor.";
  const { score, signals } = scoreTypeComplexity(typeText, quickInfo);

  service.dispose();

  return {
    fileName,
    position,
    elapsedMs,
    typeText,
    complexityScore: score,
    complexitySignals: signals,
  };
}

function createLanguageService(fileName: string, sourceText: string) {
  const compilerOptions = findCompilerOptions(fileName);
  const files = new Map<string, { version: string; text: string }>([
    [fileName, { version: "0", text: sourceText }],
  ]);

  const host: ts.LanguageServiceHost = {
    getCompilationSettings: () => compilerOptions,
    getScriptFileNames: () => [fileName],
    getScriptVersion: (name) => files.get(name)?.version ?? "0",
    getScriptSnapshot: (name) => {
      const inMemory = files.get(name);
      if (inMemory) {
        return ts.ScriptSnapshot.fromString(inMemory.text);
      }
      if (fs.existsSync(name)) {
        return ts.ScriptSnapshot.fromString(fs.readFileSync(name, "utf8"));
      }
      return undefined;
    },
    getCurrentDirectory: () => path.dirname(fileName),
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
  };

  return ts.createLanguageService(host, ts.createDocumentRegistry());
}

function findCompilerOptions(fileName: string): ts.CompilerOptions {
  const configPath = ts.findConfigFile(
    path.dirname(fileName),
    ts.sys.fileExists,
    "tsconfig.json",
  );
  if (!configPath) {
    return {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.Node16,
      moduleResolution: ts.ModuleResolutionKind.Node16,
      jsx: ts.JsxEmit.ReactJSX,
      strict: true,
    };
  }

  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) {
    return {};
  }

  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    path.dirname(configPath),
  );
  return parsed.options;
}

function scoreTypeComplexity(
  typeText: string,
  quickInfo: ts.QuickInfo | undefined,
) {
  const signals: string[] = [];
  let score = 0;

  const lengthScore = Math.min(40, Math.ceil(typeText.length / 80));
  score += lengthScore;
  signals.push(`type display length: ${typeText.length}`);

  const unionCount = countMatches(typeText, "|");
  if (unionCount > 0) {
    score += Math.min(25, unionCount * 2);
    signals.push(`union members/operators: ${unionCount}`);
  }

  const intersectionCount = countMatches(typeText, "&");
  if (intersectionCount > 0) {
    score += Math.min(20, intersectionCount * 3);
    signals.push(`intersection operators: ${intersectionCount}`);
  }

  const genericDepth = estimateGenericDepth(typeText);
  if (genericDepth > 0) {
    score += Math.min(25, genericDepth * 5);
    signals.push(`generic nesting depth: ${genericDepth}`);
  }

  const declarationCount = quickInfo?.kindModifiers
    ? quickInfo.kindModifiers.split(/\s+/).filter(Boolean).length
    : 0;
  if (declarationCount > 0) {
    score += declarationCount;
    signals.push(`symbol modifiers: ${declarationCount}`);
  }

  return { score, signals };
}

function countMatches(value: string, needle: string) {
  return value.split(needle).length - 1;
}

function estimateGenericDepth(typeText: string) {
  let depth = 0;
  let maxDepth = 0;
  for (const character of typeText) {
    if (character === "<") {
      depth += 1;
      maxDepth = Math.max(maxDepth, depth);
    }
    if (character === ">") {
      depth = Math.max(0, depth - 1);
    }
  }
  return maxDepth;
}

function renderResult(result: InspectionResult) {
  const fileName = escapeHtml(path.basename(result.fileName));
  const typeText = escapeHtml(result.typeText);
  const signals = result.complexitySignals
    .map((signal) => `<li>${escapeHtml(signal)}</li>`)
    .join("");

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      body { font-family: var(--vscode-font-family); padding: 16px; }
      code { white-space: pre-wrap; }
      .metric { margin: 12px 0; }
    </style>
  </head>
  <body>
    <h1>TSPerf</h1>
    <div class="metric"><strong>File:</strong> ${fileName}</div>
    <div class="metric"><strong>Type lookup:</strong> ${result.elapsedMs.toFixed(2)}ms</div>
    <div class="metric"><strong>Complexity score:</strong> ${result.complexityScore}</div>
    <h2>Type</h2>
    <code>${typeText}</code>
    <h2>Signals</h2>
    <ul>${signals}</ul>
  </body>
</html>`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}
