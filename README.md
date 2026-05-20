# TSPerf VS Code

TSPerf is a VS Code extension prototype for the Algora TSPerf challenge.

Goal: show the complexity and time-to-load of TypeScript types directly inside the editor.

## Current Scope

- Command: `TSPerf: Inspect Type at Cursor`
- Command: `TSPerf: Run Fixture Benchmark`
- Measures elapsed time for TypeScript language-service type lookup at the cursor.
- Reports a lightweight complexity score based on type text length, union/intersection count, generic nesting, object member hints, and symbol declarations.
- Shows inline editor decorations with lookup time and complexity score.
- Caches measurements by document URI, document version, and cursor offset.
- Includes pathological TypeScript fixtures for repeatable demo measurements.
- Avoids inspecting large files automatically.

## Why This Architecture

The extension uses the TypeScript compiler API locally. It does not execute project code and does not load package scripts. The first implementation optimizes for a defensible measurement path before adding richer UI.

## Roadmap To Prize-Grade

1. Reuse the workspace TypeScript version when available.
2. Measure `quickinfo`, type display rendering, and checker calls separately.
3. Add per-symbol historical timing trends.
4. Add CodeLens and status bar summaries.
5. Publish VSIX / Marketplace package.

## Development

```bash
npm install --ignore-scripts
npm run build
```

## Demo Flow

1. Open the extension host in VS Code.
2. Run `TSPerf: Run Fixture Benchmark`.
3. Inspect the webview table and inline decorations.
4. Open a TypeScript project file and run `TSPerf: Inspect Type at Cursor`.
