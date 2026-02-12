# CASE-005: Isolation Clean Start

## Actions and expected outcomes

1. Open Completed Games.
   Expected: the test starts with no recorded games.

This case verifies that any state written by other tests is not visible here.

## Machine Definition

```json
{
  "id": "CASE-005",
  "title": "Isolation reader starts with clean completed games",
  "steps": [
    {
      "id": "Step-1",
      "action": "Open Completed Games and verify initial empty state",
      "expected": "No completed game rows are present at test start.",
      "commands": [
        { "type": "goto", "path": "/" },
        { "type": "click", "target": { "by": "testId", "value": "dashboard-tab-completed" } },
        { "type": "expectTextContains", "target": { "by": "testId", "value": "completed-games-view" }, "value": "No games have been recorded yet." },
        { "type": "expectCount", "target": { "by": "css", "value": "[data-testid^=\"completed-game-row-\"]" }, "count": 0 }
      ]
    }
  ]
}
```
