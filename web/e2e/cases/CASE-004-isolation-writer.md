# CASE-004: Isolation Writer

## Actions and expected outcomes

1. Open Completed Games and record Duke over Kansas.
   Expected: one completed game row is present.

This case intentionally leaves written state behind to validate per-test DB isolation.

## Machine Definition

```json
{
  "id": "CASE-004",
  "title": "Isolation writer leaves completed game state",
  "steps": [
    {
      "id": "Step-1",
      "action": "Record Duke beating Kansas in Completed Games",
      "expected": "Completed game row exists in this test backend.",
      "commands": [
        { "type": "goto", "path": "/" },
        { "type": "click", "target": { "by": "testId", "value": "dashboard-tab-completed" } },
        { "type": "select", "target": { "by": "testId", "value": "completed-winner-select" }, "optionLabel": "Duke" },
        { "type": "select", "target": { "by": "testId", "value": "completed-loser-select" }, "optionLabel": "Kansas" },
        { "type": "click", "target": { "by": "testId", "value": "completed-record-button" } },
        { "type": "expectVisible", "target": { "by": "testId", "value": "completed-game-row-Duke-Kansas" } }
      ]
    }
  ]
}
```
