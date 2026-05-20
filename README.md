# TSPerf VS Code

TSPerf is a VS Code extension prototype for the Algora TSPerf challenge.

Goal: show the complexity and time-to-load of TypeScript types directly inside the editor.

## Current Scope

- Command: `TSPerf: Inspect Type at Cursor`
- Measures elapsed time for TypeScript language-service type lookup at the cursor.
- Reports a lightweight complexity score based on type text length, union/intersection count, generic nesting, object member hints, and symbol declarations.
- Avoids inspecting large files automatically.

## Why This Architecture

The extension uses the TypeScript compiler API locally. It does not execute project code and does not load package scripts. The first implementation optimizes for a defensible measurement path before adding inline UI.

## Roadmap To Prize-Grade

1. Add inline CodeLens or hover decoration with cached measurements.
2. Reuse the workspace TypeScript version when available.
3. Measure `quickinfo`, type display rendering, and checker calls separately.
4. Add per-symbol historical timing cache.
5. Add test fixtures for pathological conditional, mapped, union, and recursive types.
6. Publish MIT repo and VSIX.

## Development

```bash
npm install --ignore-scripts
npm run build
```

