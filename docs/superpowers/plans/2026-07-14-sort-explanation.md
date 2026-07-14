# Sort Explanation Plan

## Task 1: Tutorial Copy

1. Add tests that the tutorial purpose beat names Triage, Usage, and Compare.
2. Add tests that the Standing beat explains the combination model.
3. Update `WelcomePurpose` and `WelcomeStanding` copy.
4. Keep existing controls and beat order unchanged.

## Task 2: In-App Sort Hub Help

1. Add a client component for `How sorting works`.
2. Use a user-opened dismissible dialog, not an automatic modal.
3. Keep in-app copy concise:
   - header line: each round adds another layer.
   - dialog: each sort can stack on the others.
4. Add tests that the hub line renders and the dialog opens/closes.

## Task 3: Verification

1. Run focused tutorial and sort hub tests.
2. Run lint for UI/a11y mistakes.
3. Run broader tests/build if code shape warrants it.

## Review Notes Folded

- In-app copy must not explain detailed projection mechanics.
- Tutorial can explain: Triage groups, Usage adds a note, Compare orders.
- Modal is acceptable only as an optional help control.
- Phone labels must stay short enough to fit.
