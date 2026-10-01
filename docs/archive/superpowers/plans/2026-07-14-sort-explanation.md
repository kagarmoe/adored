# Sort Explanation Plan

## Task 1: Tutorial Copy

1. Add tests that the tutorial purpose beat names Triage, Usage, and Compare.
2. Add tests that the walkthrough shows a standing after Triage, after Usage, and after Compare.
3. Update sample data so the same small sample collection participates across the three rounds.
4. Drive Usage across every sample item, then drive Compare across every pair in the current ranked standing.
5. Add an interim standing component for the after-Triage and after-Usage beats.
6. Add a sample hand-order list to the Refine beat so manual re-ranking is shown, not only described.
7. Update `WelcomePurpose`, `WelcomeStanding`, and walkthrough sequencing.

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
- Tutorial should demonstrate the progression: Triage creates the first standing, Usage adds visible notes to that standing, Compare updates order within the same cumulative result.
- The manual re-ranking tutorial beat needs an actual reorderable list.
- Modal is acceptable only as an optional help control.
- Phone labels must stay short enough to fit.
