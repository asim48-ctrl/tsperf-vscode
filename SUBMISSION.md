# TSPerf Challenge Submission

Challenge: https://algora.io/challenges/tsperf

Repository: https://github.com/asim48-ctrl/tsperf-vscode

Installable VSIX: https://github.com/asim48-ctrl/tsperf-vscode/releases/tag/v0.1.0

## Summary

TSPerf VS Code is an MIT-licensed VS Code plugin for TypeScript that shows type lookup latency and a lightweight type complexity score directly in the editor.

## Implemented

- `TSPerf: Inspect Type at Cursor`
- `TSPerf: Run Fixture Benchmark`
- Inline editor decorations with lookup time and complexity score
- Cached measurements by document URI, document version, and cursor offset
- Webview details for type text and complexity signals
- Pathological TypeScript fixture benchmark
- Clean VSIX packaging

## Verification

```bash
npm install --ignore-scripts
npm run build
npm run package
```

## Notes

The implementation uses the TypeScript compiler API locally and does not execute project code.
