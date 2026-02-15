# CASE-001: Dashboard, Bracket, Team Detail, Market Maker

## Actions and expected outcomes

1. Open the dashboard.
   Expected: the app title and teams tab render.
2. Switch to Bracket view and select Sweet 16 layout.
   Expected: bracket container is visible and view selector updates.
3. Switch to Team Detail and choose Duke.
   Expected: market maker and fill comparison content render for the selected team.
4. Verify market-focused panels are present.
   Expected: order book and market maker controls are visible.

## Machine Definition

```json
{
  "id": "CASE-001",
  "title": "Dashboard bracket team detail market maker flow",
  "steps": [
    {
      "id": "Step-1",
      "action": "Open dashboard root page",
      "expected": "Title and Teams tab are visible.",
      "commands": [
        { "type": "goto", "path": "/" },
        { "type": "expectVisible", "target": { "by": "testId", "value": "app-title" } },
        { "type": "expectVisible", "target": { "by": "testId", "value": "dashboard-tab-teams" } }
      ]
    },
    {
      "id": "Step-2",
      "action": "Open Bracket tab and set view to Sweet 16",
      "expected": "Bracket panel is visible and selector value becomes sweet16.",
      "commands": [
        { "type": "click", "target": { "by": "testId", "value": "dashboard-tab-bracket" } },
        { "type": "expectVisible", "target": { "by": "testId", "value": "bracket-view" } },
        { "type": "select", "target": { "by": "testId", "value": "bracket-view-select" }, "optionValue": "sweet16" },
        { "type": "expectValue", "target": { "by": "testId", "value": "bracket-view-select" }, "value": "sweet16" }
      ]
    },
    {
      "id": "Step-3",
      "action": "Open Team Detail tab and choose Duke",
      "expected": "Team Detail market maker content loads for Duke.",
      "commands": [
        { "type": "click", "target": { "by": "testId", "value": "dashboard-tab-teamdetail" } },
        { "type": "expectVisible", "target": { "by": "testId", "value": "teamdetail-team-select" } },
        { "type": "select", "target": { "by": "testId", "value": "teamdetail-team-select" }, "optionValue": "Duke" },
        { "type": "expectVisible", "target": { "by": "role", "role": "heading", "name": "Fill Scenario Comparison" } }
      ]
    },
    {
      "id": "Step-4",
      "action": "Verify order book and market maker controls are visible",
      "expected": "Market controls and order book render on the Team Detail page.",
      "commands": [
        { "type": "expectVisible", "target": { "by": "testId", "value": "teamdetail-orderbook" } },
        { "type": "expectVisible", "target": { "by": "testId", "value": "teamdetail-market-maker" } },
        { "type": "expectVisible", "target": { "by": "testId", "value": "teamdetail-fill-comparison" } }
      ]
    }
  ]
}
```
