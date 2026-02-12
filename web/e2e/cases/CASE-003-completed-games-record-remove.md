# CASE-003: Completed Games Record and Remove

## Actions and expected outcomes

1. Navigate to Completed Games.
   Expected: the completed games workflow is visible.
2. Record Duke over Kansas.
   Expected: a completed game row appears.
3. Remove the recorded game.
   Expected: the completed games list returns to empty.
4. Re-select loser Kansas after removal.
   Expected: Kansas is available again for selection.

## Machine Definition

```json
{
  "id": "CASE-003",
  "title": "Completed games record remove and restore team availability",
  "steps": [
    {
      "id": "Step-1",
      "action": "Open Completed Games view",
      "expected": "Completed Games controls are visible.",
      "commands": [
        { "type": "goto", "path": "/" },
        { "type": "click", "target": { "by": "testId", "value": "dashboard-tab-completed" } },
        { "type": "expectVisible", "target": { "by": "testId", "value": "completed-games-view" } },
        { "type": "expectVisible", "target": { "by": "testId", "value": "completed-winner-select" } },
        { "type": "expectVisible", "target": { "by": "testId", "value": "completed-loser-select" } }
      ]
    },
    {
      "id": "Step-2",
      "action": "Record Duke beating Kansas",
      "expected": "A row for Duke-Kansas appears in the completed games table.",
      "commands": [
        { "type": "select", "target": { "by": "testId", "value": "completed-winner-select" }, "optionLabel": "Duke" },
        { "type": "select", "target": { "by": "testId", "value": "completed-loser-select" }, "optionLabel": "Kansas" },
        { "type": "click", "target": { "by": "testId", "value": "completed-record-button" } },
        { "type": "expectVisible", "target": { "by": "testId", "value": "completed-game-row-Duke-Kansas" } }
      ]
    },
    {
      "id": "Step-3",
      "action": "Remove the recorded game",
      "expected": "Completed games list is empty again.",
      "commands": [
        { "type": "click", "target": { "by": "testId", "value": "completed-remove-Duke-Kansas" } },
        { "type": "expectTextContains", "target": { "by": "testId", "value": "completed-games-view" }, "value": "No games have been recorded yet." }
      ]
    },
    {
      "id": "Step-4",
      "action": "Verify Kansas can be selected as loser again",
      "expected": "Loser select accepts Kansas after game removal.",
      "commands": [
        { "type": "select", "target": { "by": "testId", "value": "completed-winner-select" }, "optionLabel": "Duke" },
        { "type": "select", "target": { "by": "testId", "value": "completed-loser-select" }, "optionLabel": "Kansas" },
        { "type": "expectValue", "target": { "by": "testId", "value": "completed-loser-select" }, "value": "Kansas" }
      ]
    }
  ]
}
```
