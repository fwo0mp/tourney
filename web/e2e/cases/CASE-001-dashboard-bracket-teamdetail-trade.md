# CASE-001: Dashboard, Bracket, Team Detail, Hypothetical Trade

## Actions and expected outcomes

1. Open the dashboard.
   Expected: the app title and teams tab render.
2. Switch to Bracket view and select Sweet 16 layout.
   Expected: bracket container is visible and view selector updates.
3. Switch to Team Detail and choose Duke.
   Expected: team detail content renders for the selected team.
4. Configure a hypothetical buy trade.
   Expected: position/EV/net-impact cards render with trade context.

## Machine Definition

```json
{
  "id": "CASE-001",
  "title": "Dashboard bracket team detail trade flow",
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
      "expected": "Team Detail content loads for Duke.",
      "commands": [
        { "type": "click", "target": { "by": "testId", "value": "dashboard-tab-teamdetail" } },
        { "type": "expectVisible", "target": { "by": "testId", "value": "teamdetail-team-select" } },
        { "type": "select", "target": { "by": "testId", "value": "teamdetail-team-select" }, "optionValue": "Duke" },
        { "type": "expectVisible", "target": { "by": "text", "value": "Hypothetical Trade" } }
      ]
    },
    {
      "id": "Step-4",
      "action": "Set buy quantity and price for hypothetical trade",
      "expected": "Impact cards are visible for position, EV change, and net impact.",
      "commands": [
        { "type": "click", "target": { "by": "testId", "value": "teamdetail-direction-buy" } },
        { "type": "fill", "target": { "by": "testId", "value": "teamdetail-quantity-input" }, "value": "5" },
        { "type": "fill", "target": { "by": "testId", "value": "teamdetail-price-input" }, "value": "2.5" },
        { "type": "expectVisible", "target": { "by": "testId", "value": "teamdetail-position-change-card" } },
        { "type": "expectVisible", "target": { "by": "testId", "value": "teamdetail-ev-change-card" } },
        { "type": "expectVisible", "target": { "by": "testId", "value": "teamdetail-net-impact-card" } }
      ]
    }
  ]
}
```
