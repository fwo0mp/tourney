# CASE-002: What-If Scenario Lifecycle

## Actions and expected outcomes

1. Open What-If tab and create a scenario.
   Expected: the new scenario becomes active.
2. Add one scenario game outcome override and one permanent rating adjustment.
   Expected: each override appears in the correct section.
3. Analyze scenario impact.
   Expected: scenario results render.
4. Clear temporary overrides and then clear all overrides.
   Expected: scenario section empties first, then permanent section empties.

## Machine Definition

```json
{
  "id": "CASE-002",
  "title": "What-if scenario lifecycle with temporary and permanent overrides",
  "steps": [
    {
      "id": "Step-1",
      "action": "Open What-If tab and create a scenario named E2E Scenario Alpha",
      "expected": "Scenario selector shows E2E Scenario Alpha as active.",
      "commands": [
        { "type": "goto", "path": "/" },
        { "type": "click", "target": { "by": "testId", "value": "dashboard-tab-whatif" } },
        { "type": "expectVisible", "target": { "by": "testId", "value": "whatif-tool" } },
        { "type": "click", "target": { "by": "testId", "value": "scenario-selector-toggle" } },
        { "type": "click", "target": { "by": "testId", "value": "scenario-create-button" } },
        { "type": "fill", "target": { "by": "testId", "value": "scenario-create-input" }, "value": "E2E Scenario Alpha" },
        { "type": "click", "target": { "by": "testId", "value": "scenario-create-confirm" } },
        { "type": "expectTextContains", "target": { "by": "testId", "value": "scenario-selector-toggle" }, "value": "E2E Scenario Alpha" }
      ]
    },
    {
      "id": "Step-2",
      "action": "Add a temporary Duke beats Kansas game outcome override",
      "expected": "Scenario override section includes Duke beats Kansas.",
      "commands": [
        { "type": "select", "target": { "by": "testId", "value": "whatif-winner-select" }, "optionLabel": "Duke" },
        { "type": "select", "target": { "by": "testId", "value": "whatif-loser-select" }, "optionLabel": "Kansas" },
        { "type": "click", "target": { "by": "testId", "value": "whatif-add-outcome" } },
        { "type": "expectTextContains", "target": { "by": "testId", "value": "whatif-scenario-overrides" }, "value": "Duke beats Kansas" }
      ]
    },
    {
      "id": "Step-3",
      "action": "Add a permanent Duke +2.0 rating adjustment",
      "expected": "Permanent overrides include Duke +2.0 pts.",
      "commands": [
        { "type": "check", "target": { "by": "testId", "value": "whatif-permanent-adjust" } },
        { "type": "select", "target": { "by": "testId", "value": "whatif-adjust-team-select" }, "optionLabel": "Duke" },
        { "type": "fill", "target": { "by": "testId", "value": "whatif-adjust-value-input" }, "value": "2" },
        { "type": "click", "target": { "by": "testId", "value": "whatif-add-adjustment" } },
        { "type": "expectTextContains", "target": { "by": "testId", "value": "whatif-permanent-overrides" }, "value": "Duke +2.0 pts" }
      ]
    },
    {
      "id": "Step-4",
      "action": "Analyze scenario",
      "expected": "Scenario results panel is visible.",
      "commands": [
        { "type": "click", "target": { "by": "testId", "value": "whatif-analyze-button" } },
        { "type": "expectVisible", "target": { "by": "testId", "value": "whatif-results" } },
        { "type": "expectTextContains", "target": { "by": "testId", "value": "whatif-results" }, "value": "Scenario Impact" }
      ]
    },
    {
      "id": "Step-5",
      "action": "Clear temporary overrides then clear all overrides",
      "expected": "Scenario section empties first, then permanent section empties.",
      "commands": [
        { "type": "click", "target": { "by": "testId", "value": "whatif-clear-temp" } },
        { "type": "expectTextContains", "target": { "by": "testId", "value": "whatif-scenario-overrides" }, "value": "No scenario overrides" },
        { "type": "click", "target": { "by": "testId", "value": "whatif-clear-all" } },
        { "type": "expectTextContains", "target": { "by": "testId", "value": "whatif-permanent-overrides" }, "value": "No permanent overrides" }
      ]
    }
  ]
}
```
