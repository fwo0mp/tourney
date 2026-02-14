# E2E Markdown Cases

Each case in this directory is the source-of-truth definition for one Playwright test.

## Required structure

1. Human-readable sections describing actions and expected outcomes.
2. A single machine-readable JSON block in triple backticks:

```json
{
  "id": "CASE-000",
  "title": "Example title",
  "steps": [
    {
      "id": "Step-1",
      "action": "Describe the user action",
      "expected": "Describe the expected outcome",
      "commands": [
        { "type": "goto", "path": "/" },
        { "type": "expectVisible", "target": { "by": "testId", "value": "app-title" } }
      ]
    }
  ]
}
```

## Supported command types

- `goto`
- `reload`
- `click`
- `dblclick`
- `fill`
- `select`
- `check`
- `uncheck`
- `press`
- `waitForTimeout`
- `expectVisible`
- `expectHidden`
- `expectTextContains`
- `expectTextEquals`
- `expectValue`
- `expectCount`
- `expectUrlContains`
- `expectEnabled`
- `expectDisabled`

## Supported locator types

- `{ "by": "testId", "value": "..." }`
- `{ "by": "text", "value": "..." }`
- `{ "by": "role", "role": "...", "name": "..." }`
- `{ "by": "css", "value": "..." }`

Optional locator modifiers:

- `"nth": <number>`
- `"first": true`
- `"last": true`
