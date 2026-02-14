# CASE-006: Team Detail Market Maker Defaults

## Actions and expected outcomes

1. Open Team Detail and select Duke.
   Expected: existing two-sided market initializes midpoint/spread from live bid/ask.
2. Select Houston.
   Expected: bid-only market initializes with 5% spread and midpoint preserving the bid.
3. Select Auburn.
   Expected: ask-only market initializes with 5% spread and midpoint preserving the ask.
4. Select Kansas.
   Expected: no-market team initializes with EV midpoint and 5% spread.

## Machine Definition

```json
{
  "id": "CASE-006",
  "title": "Team detail market maker defaults for two-sided one-sided and empty markets",
  "steps": [
    {
      "id": "Step-1",
      "action": "Open Team Detail and pick Duke",
      "expected": "Duke defaults reflect existing bid/ask and highlighted orderbook rows are visible.",
      "commands": [
        { "type": "goto", "path": "/" },
        { "type": "click", "target": { "by": "testId", "value": "dashboard-tab-teamdetail" } },
        { "type": "select", "target": { "by": "testId", "value": "teamdetail-team-select" }, "optionValue": "Duke" },
        { "type": "expectVisible", "target": { "by": "testId", "value": "teamdetail-market-maker" } },
        { "type": "expectValue", "target": { "by": "testId", "value": "teamdetail-market-midpoint-input" }, "value": "2.58" },
        { "type": "expectValue", "target": { "by": "testId", "value": "teamdetail-market-spread-input" }, "value": "5.8" },
        { "type": "expectValue", "target": { "by": "testId", "value": "teamdetail-market-bid-input" }, "value": "2.5" },
        { "type": "expectValue", "target": { "by": "testId", "value": "teamdetail-market-ask-input" }, "value": "2.65" },
        { "type": "expectVisible", "target": { "by": "testId", "value": "teamdetail-orderbook-my-bid" } },
        { "type": "expectVisible", "target": { "by": "testId", "value": "teamdetail-orderbook-my-ask" } }
      ]
    },
    {
      "id": "Step-2",
      "action": "Select Houston bid-only market",
      "expected": "Spread resets to 5.0 and midpoint keeps live bid at 3.1.",
      "commands": [
        { "type": "select", "target": { "by": "testId", "value": "teamdetail-team-select" }, "optionValue": "Houston" },
        { "type": "expectValue", "target": { "by": "testId", "value": "teamdetail-market-spread-input" }, "value": "5.0" },
        { "type": "expectValue", "target": { "by": "testId", "value": "teamdetail-market-midpoint-input" }, "value": "3.18" },
        { "type": "expectValue", "target": { "by": "testId", "value": "teamdetail-market-bid-input" }, "value": "3.1" },
        { "type": "expectValue", "target": { "by": "testId", "value": "teamdetail-market-ask-input" }, "value": "3.27" },
        { "type": "expectValue", "target": { "by": "testId", "value": "teamdetail-market-bid-size-input" }, "value": "3000" },
        { "type": "expectValue", "target": { "by": "testId", "value": "teamdetail-market-ask-size-input" }, "value": "5000" }
      ]
    },
    {
      "id": "Step-3",
      "action": "Select Auburn ask-only market",
      "expected": "Spread resets to 5.0 and midpoint keeps live ask at 4.2.",
      "commands": [
        { "type": "select", "target": { "by": "testId", "value": "teamdetail-team-select" }, "optionValue": "Auburn" },
        { "type": "expectValue", "target": { "by": "testId", "value": "teamdetail-market-spread-input" }, "value": "5.0" },
        { "type": "expectValue", "target": { "by": "testId", "value": "teamdetail-market-midpoint-input" }, "value": "4.09" },
        { "type": "expectValue", "target": { "by": "testId", "value": "teamdetail-market-bid-input" }, "value": "3.99" },
        { "type": "expectValue", "target": { "by": "testId", "value": "teamdetail-market-ask-input" }, "value": "4.2" },
        { "type": "expectValue", "target": { "by": "testId", "value": "teamdetail-market-bid-size-input" }, "value": "5000" },
        { "type": "expectValue", "target": { "by": "testId", "value": "teamdetail-market-ask-size-input" }, "value": "2000" }
      ]
    },
    {
      "id": "Step-4",
      "action": "Select Kansas no-market team",
      "expected": "Spread is 5.0 and midpoint defaults to team EV for this team.",
      "commands": [
        { "type": "select", "target": { "by": "testId", "value": "teamdetail-team-select" }, "optionValue": "Kansas" },
        { "type": "expectValue", "target": { "by": "testId", "value": "teamdetail-market-spread-input" }, "value": "5.0" },
        { "type": "expectValue", "target": { "by": "testId", "value": "teamdetail-market-midpoint-input" }, "value": "1.75" },
        { "type": "expectValue", "target": { "by": "testId", "value": "teamdetail-market-bid-input" }, "value": "1.71" },
        { "type": "expectValue", "target": { "by": "testId", "value": "teamdetail-market-ask-input" }, "value": "1.8" },
        { "type": "expectTextContains", "target": { "by": "testId", "value": "teamdetail-market-submit" }, "value": "Place Market" }
      ]
    }
  ]
}
```
