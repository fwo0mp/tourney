# CASE-006: URL Navigation State Roundtrip

## Actions and expected outcomes

1. Switch tabs and bracket subview.
   Expected: URL updates with tab/subview and reload restores the same tab/subview.
2. Select a game from Game Importance.
   Expected: game params appear in URL and reload keeps the game panel open.
3. Select a team from the game panel.
   Expected: team param appears in URL and reload keeps the team panel open.
4. Navigate to Team Detail from the team panel.
   Expected: team-detail params appear in URL and reload restores selected team detail state.

## Machine Definition

```json
{
  "id": "CASE-006",
  "title": "URL navigation state roundtrip",
  "steps": [
    {
      "id": "Step-1",
      "action": "Open Bracket tab, pick Sweet 16, and verify URL + reload restore",
      "expected": "URL contains bracket tab/subview params and Sweet 16 remains selected after reload.",
      "commands": [
        { "type": "goto", "path": "/" },
        { "type": "click", "target": { "by": "testId", "value": "dashboard-tab-bracket" } },
        { "type": "expectVisible", "target": { "by": "testId", "value": "bracket-view" } },
        { "type": "select", "target": { "by": "testId", "value": "bracket-view-select" }, "optionValue": "sweet16" },
        { "type": "expectValue", "target": { "by": "testId", "value": "bracket-view-select" }, "value": "sweet16" },
        { "type": "expectUrlContains", "value": "[?&]view=bracket(?:&|$)" },
        { "type": "expectUrlContains", "value": "[?&]bracketView=sweet16(?:&|$)" },
        { "type": "reload" },
        { "type": "expectVisible", "target": { "by": "testId", "value": "bracket-view" } },
        { "type": "expectValue", "target": { "by": "testId", "value": "bracket-view-select" }, "value": "sweet16" },
        { "type": "expectUrlContains", "value": "[?&]view=bracket(?:&|$)" },
        { "type": "expectUrlContains", "value": "[?&]bracketView=sweet16(?:&|$)" }
      ]
    },
    {
      "id": "Step-2",
      "action": "Switch to What-If and Completed tabs and verify URL + reload restore",
      "expected": "Each tab writes view param and reload returns to the same tab.",
      "commands": [
        { "type": "click", "target": { "by": "testId", "value": "dashboard-tab-whatif" } },
        { "type": "expectVisible", "target": { "by": "testId", "value": "whatif-tool" } },
        { "type": "expectUrlContains", "value": "[?&]view=whatif(?:&|$)" },
        { "type": "reload" },
        { "type": "expectVisible", "target": { "by": "testId", "value": "whatif-tool" } },
        { "type": "expectUrlContains", "value": "[?&]view=whatif(?:&|$)" },
        { "type": "click", "target": { "by": "testId", "value": "dashboard-tab-completed" } },
        { "type": "expectVisible", "target": { "by": "testId", "value": "completed-games-view" } },
        { "type": "expectUrlContains", "value": "[?&]view=completed(?:&|$)" },
        { "type": "reload" },
        { "type": "expectVisible", "target": { "by": "testId", "value": "completed-games-view" } },
        { "type": "expectUrlContains", "value": "[?&]view=completed(?:&|$)" }
      ]
    },
    {
      "id": "Step-3",
      "action": "Select a game from Game Importance and verify URL + reload restore",
      "expected": "URL stores selected game teams and reload keeps the game panel visible.",
      "commands": [
        { "type": "click", "target": { "by": "testId", "value": "dashboard-tab-teams" } },
        { "type": "expectVisible", "target": { "by": "testId", "value": "game-importance-table" } },
        { "type": "click", "target": { "by": "testId", "value": "game-importance-row", "first": true } },
        { "type": "expectVisible", "target": { "by": "testId", "value": "game-panel" } },
        { "type": "expectUrlContains", "value": "[?&]game1=[^&]+(?:&|$)" },
        { "type": "expectUrlContains", "value": "[?&]game2=[^&]+(?:&|$)" },
        { "type": "reload" },
        { "type": "expectVisible", "target": { "by": "testId", "value": "game-panel" } },
        { "type": "expectUrlContains", "value": "[?&]game1=[^&]+(?:&|$)" },
        { "type": "expectUrlContains", "value": "[?&]game2=[^&]+(?:&|$)" }
      ]
    },
    {
      "id": "Step-4",
      "action": "Select a team from game panel and verify URL + reload restore",
      "expected": "URL stores selected team and reload keeps the team panel visible.",
      "commands": [
        { "type": "click", "target": { "by": "testId", "value": "game-panel-team1-button" } },
        { "type": "expectVisible", "target": { "by": "testId", "value": "team-panel" } },
        { "type": "expectUrlContains", "value": "[?&]team=[^&]+(?:&|$)" },
        { "type": "reload" },
        { "type": "expectVisible", "target": { "by": "testId", "value": "team-panel" } },
        { "type": "expectUrlContains", "value": "[?&]team=[^&]+(?:&|$)" }
      ]
    },
    {
      "id": "Step-5",
      "action": "Open Team Detail from team panel and verify URL + reload restore",
      "expected": "URL stores teamdetail tab and selected detail team, and reload keeps the same team detail view.",
      "commands": [
        { "type": "click", "target": { "by": "role", "role": "button", "name": "View Details" } },
        { "type": "expectVisible", "target": { "by": "testId", "value": "teamdetail-team-select" } },
        { "type": "expectVisible", "target": { "by": "role", "role": "heading", "name": "Hypothetical Trade" } },
        { "type": "expectUrlContains", "value": "[?&]view=teamdetail(?:&|$)" },
        { "type": "expectUrlContains", "value": "[?&]detailTeam=[^&]+(?:&|$)" },
        { "type": "reload" },
        { "type": "expectVisible", "target": { "by": "testId", "value": "teamdetail-team-select" } },
        { "type": "expectVisible", "target": { "by": "role", "role": "heading", "name": "Hypothetical Trade" } },
        { "type": "expectUrlContains", "value": "[?&]view=teamdetail(?:&|$)" },
        { "type": "expectUrlContains", "value": "[?&]detailTeam=[^&]+(?:&|$)" }
      ]
    }
  ]
}
```
