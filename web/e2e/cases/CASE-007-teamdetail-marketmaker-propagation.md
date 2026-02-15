# CASE-007: Team Detail Market Maker UI Propagation

## Actions and expected outcomes

1. Open Team Detail and select Duke.
   Expected: fill comparison and delta risk panels are visible.
2. Change spread and midpoint.
   Expected: bid/ask prices and fill-comparison assumptions update consistently.
3. Change bid/ask sizes.
   Expected: fill assumptions and delta-risk subtitles reflect new sizes.
4. Enter an invalid quote.
   Expected: submit button disables and fill comparison is replaced by placeholder text.

## Machine Definition

```json
{
  "id": "CASE-007",
  "title": "Team detail market maker midpoint spread and size propagation",
  "steps": [
    {
      "id": "Step-1",
      "action": "Open Team Detail and choose Duke",
      "expected": "Fill comparison and risk sections render.",
      "commands": [
        { "type": "goto", "path": "/" },
        { "type": "click", "target": { "by": "testId", "value": "dashboard-tab-teamdetail" } },
        { "type": "select", "target": { "by": "testId", "value": "teamdetail-team-select" }, "optionValue": "Duke" },
        { "type": "expectVisible", "target": { "by": "testId", "value": "teamdetail-fill-comparison" } },
        { "type": "expectVisible", "target": { "by": "text", "value": "Bid Fill Delta Risk" } },
        { "type": "expectVisible", "target": { "by": "text", "value": "Ask Fill Delta Risk" } }
      ]
    },
    {
      "id": "Step-2",
      "action": "Set spread to 5.0 and midpoint to 3.00",
      "expected": "Bid/ask fields and fill assumptions update to match new quote.",
      "commands": [
        { "type": "fill", "target": { "by": "testId", "value": "teamdetail-market-spread-input" }, "value": "5.0" },
        { "type": "expectValue", "target": { "by": "testId", "value": "teamdetail-market-spread-input" }, "value": "5.0" },
        { "type": "fill", "target": { "by": "testId", "value": "teamdetail-market-midpoint-input" }, "value": "3.00" },
        { "type": "expectValue", "target": { "by": "testId", "value": "teamdetail-market-bid-input" }, "value": "2.92" },
        { "type": "expectValue", "target": { "by": "testId", "value": "teamdetail-market-ask-input" }, "value": "3.08" },
        { "type": "expectTextContains", "target": { "by": "testId", "value": "teamdetail-fill-assumption-bid" }, "value": "+5,000 shares @ 2.92" },
        { "type": "expectTextContains", "target": { "by": "testId", "value": "teamdetail-fill-assumption-ask" }, "value": "-5,000 shares @ 3.08" }
      ]
    },
    {
      "id": "Step-3",
      "action": "Adjust sizes to 4200 bid and 3600 ask",
      "expected": "Fill assumptions and risk subtitles reflect updated quantities.",
      "commands": [
        { "type": "fill", "target": { "by": "testId", "value": "teamdetail-market-bid-size-input" }, "value": "4200" },
        { "type": "fill", "target": { "by": "testId", "value": "teamdetail-market-ask-size-input" }, "value": "3600" },
        { "type": "expectTextContains", "target": { "by": "testId", "value": "teamdetail-fill-assumption-bid" }, "value": "+4,200 shares @ 2.92" },
        { "type": "expectTextContains", "target": { "by": "testId", "value": "teamdetail-fill-assumption-ask" }, "value": "-3,600 shares @ 3.08" },
        { "type": "expectVisible", "target": { "by": "text", "value": "How team deltas change if your bid fully fills (+4,200 shares)." } },
        { "type": "expectVisible", "target": { "by": "text", "value": "How team deltas change if your ask fully fills (-3,600 shares)." } }
      ]
    },
    {
      "id": "Step-4",
      "action": "Enter invalid bid/ask (bid >= ask)",
      "expected": "Submit disables and placeholder replaces fill comparison.",
      "commands": [
        { "type": "fill", "target": { "by": "testId", "value": "teamdetail-market-bid-input" }, "value": "3.50" },
        { "type": "fill", "target": { "by": "testId", "value": "teamdetail-market-ask-input" }, "value": "3.40" },
        { "type": "expectDisabled", "target": { "by": "testId", "value": "teamdetail-market-submit" } },
        { "type": "expectTextContains", "target": { "by": "testId", "value": "teamdetail-market-summary" }, "value": "Invalid: bid must be less than ask" },
        { "type": "expectVisible", "target": { "by": "testId", "value": "teamdetail-fill-placeholder" } }
      ]
    }
  ]
}
```
