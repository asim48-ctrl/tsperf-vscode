import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import ts from "typescript";

type InspectionResult = {
  fileName: string;
  position: number;
  line: number;
  elapsedMs: number;
  typeText: string;
  complexityScore: number;
  complexitySignals: string[];
  source: "fresh" | "cache";
};

export function activate(context: vscode.ExtensionContext) {
  const cache = new Map<string, InspectionResult>();
  const decorationType = vscode.window.createTextEditorDecorationType({
    after: {
      margin: "0 0 0 1.25rem",
      color: new vscode.ThemeColor("descriptionForeground"),
      fontStyle: "italic",
    },
  });

  const inspectDisposable = vscode.commands.registerCommand(
    "tsperf.inspectTypeAtCursor",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage("Open a TypeScript file first.");
        return;
      }

      const result = inspectEditorType(editor, cache);
      if (!result) {
        return;
      }

      if (isInlineDecorationEnabled()) {
        showInlineMeasurements(editor, [result], decorationType);
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

  const benchmarkDisposable = vscode.commands.registerCommand(
    "tsperf.runFixtureBenchmark",
    async () => {
      const benchmarkUri = vscode.Uri.joinPath(
        context.extensionUri,
        "fixtures",
        "pathological-types.ts",
      );
      const document = await vscode.workspace.openTextDocument(benchmarkUri);
      const editor = await vscode.window.showTextDocument(document);
      const results = runFixtureBenchmark(editor, cache);

      if (isInlineDecorationEnabled()) {
        showInlineMeasurements(editor, results, decorationType);
      }

      const panel = vscode.window.createWebviewPanel(
        "tsperfBenchmark",
        "TSPerf Benchmark",
        vscode.ViewColumn.Beside,
        { enableScripts: false },
      );
      panel.webview.html = renderBenchmark(results);
    },
  );

  const clearCacheDisposable = vscode.workspace.onDidChangeTextDocument(
    (event) => {
      for (const key of cache.keys()) {
        if (key.startsWith(`${event.document.uri.toString()}:`)) {
          cache.delete(key);
        }
      }
    },
  );

  context.subscriptions.push(
    inspectDisposable,
    benchmarkDisposable,
    clearCacheDisposable,
    decorationType,
  );
}

export function deactivate() {}

function inspectEditorType(
  editor: vscode.TextEditor,
  cache?: Map<string, InspectionResult>,
): InspectionResult | null {
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
  const cacheKey = getCacheKey(document, position);
  const cached = cache?.get(cacheKey);
  if (cached) {
    return { ...cached, source: "cache" };
  }

  const service = createLanguageService(fileName, sourceText);
  const started = performance.now();
  const quickInfo = service.getQuickInfoAtPosition(fileName, position);
  const elapsedMs = performance.now() - started;

  const typeText = quickInfo
    ? ts.displayPartsToString(quickInfo.displayParts)
    : "No TypeScript type information available at cursor.";
  const { score, signals } = scoreTypeComplexity(typeText, quickInfo);

  service.dispose();

  const result: InspectionResult = {
    fileName,
    position,
    line: editor.selection.active.line,
    elapsedMs,
    typeText,
    complexityScore: score,
    complexitySignals: signals,
    source: "fresh",
  };
  cache?.set(cacheKey, result);
  return result;
}

function runFixtureBenchmark(
  editor: vscode.TextEditor,
  cache: Map<string, InspectionResult>,
) {
  const markers = [
    "unionTarget",
    "intersectionTarget",
    "conditionalTarget",
    "recursiveTarget",
  ];
  const results: InspectionResult[] = [];

  for (const marker of markers) {
    const position = findTextPosition(editor.document, marker);
    if (!position) {
      continue;
    }
    editor.selection = new vscode.Selection(position, position);
    const result = inspectEditorType(editor, cache);
    if (result) {
      results.push(result);
    }
  }

  return results;
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

function showInlineMeasurements(
  editor: vscode.TextEditor,
  results: InspectionResult[],
  decorationType: vscode.TextEditorDecorationType,
) {
  const decorations = results.map((result) => {
    const line = editor.document.lineAt(result.line);
    const badge = ` TSPerf ${result.elapsedMs.toFixed(1)}ms | score ${result.complexityScore}${
      result.source === "cache" ? " | cached" : ""
    }`;
    return {
      range: new vscode.Range(line.range.end, line.range.end),
      renderOptions: { after: { contentText: badge } },
      hoverMessage: new vscode.MarkdownString(
        [
          `**TSPerf**`,
          ``,
          `- Type lookup: \`${result.elapsedMs.toFixed(2)}ms\``,
          `- Complexity score: \`${result.complexityScore}\``,
          `- Source: \`${result.source}\``,
          ``,
          ...result.complexitySignals.map((signal) => `- ${signal}`),
        ].join("\n"),
      ),
    };
  });

  editor.setDecorations(decorationType, decorations);
}

function getCacheKey(document: vscode.TextDocument, position: number) {
  return `${document.uri.toString()}:${document.version}:${position}`;
}

function isInlineDecorationEnabled() {
  return vscode.workspace
    .getConfiguration("tsperf")
    .get<boolean>("enableInlineDecorations", true);
}

function findTextPosition(document: vscode.TextDocument, marker: string) {
  const index = document.getText().indexOf(marker);
  if (index === -1) {
    return null;
  }
  return document.positionAt(index);
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

  return renderPage(
    "TSPerf",
    `<div class="metric"><strong>File:</strong> ${fileName}</div>
    <div class="metric"><strong>Type lookup:</strong> ${result.elapsedMs.toFixed(2)}ms</div>
    <div class="metric"><strong>Complexity score:</strong> ${result.complexityScore}</div>
    <div class="metric"><strong>Measurement:</strong> ${result.source}</div>
    <h2>Type</h2>
    <code>${typeText}</code>
    <h2>Signals</h2>
    <ul>${signals}</ul>`,
  );
}

function renderBenchmark(results: InspectionResult[]) {
  const rows = results
    .map(
      (result) => `<tr>
        <td>${escapeHtml(String(result.line + 1))}</td>
        <td>${escapeHtml(result.elapsedMs.toFixed(2))}ms</td>
        <td>${escapeHtml(String(result.complexityScore))}</td>
        <td><code>${escapeHtml(result.typeText)}</code></td>
      </tr>`,
    )
    .join("");
  const totalMs = results.reduce((sum, result) => sum + result.elapsedMs, 0);

  return renderPage(
    "TSPerf Fixture Benchmark",
    `<div class="metric"><strong>Symbols measured:</strong> ${results.length}</div>
    <div class="metric"><strong>Total lookup time:</strong> ${totalMs.toFixed(2)}ms</div>
    <table>
      <thead><tr><th>Line</th><th>Lookup</th><th>Score</th><th>Type</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`,
  );
}

function renderPage(title: string, body: string) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      body { font-family: var(--vscode-font-family); padding: 16px; }
      code { white-space: pre-wrap; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border-bottom: 1px solid var(--vscode-editorWidget-border); padding: 8px; text-align: left; vertical-align: top; }
      .metric { margin: 12px 0; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(title)}</h1>
    ${body}
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
