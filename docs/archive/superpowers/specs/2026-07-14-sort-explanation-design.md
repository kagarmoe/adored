# Sort Explanation Design

## Context

Compare is now an independent sort. The tutorial and the in-app sorting hub need to explain the three rounds accurately:

- Triage answers "How do you feel about this?" and creates Love / Like / Maybe / Onward groups.
- Usage answers "Do you use this?" and adds a quiet use/resting note.
- Compare answers "Which do you love more?" and puts items in order.

The app should be concise and usable without the tutorial. The tutorial can teach the fuller model.

## Goals

1. Make `/tutorial` represent the current sorting model.
2. Make the app's sort hub self-contained without turning it into documentation.
3. Provide optional deeper help in the app with a dismissible dialog, opened by the user.
4. Preserve phone/tablet fit. Short button text must fit on phone.

## Non-Goals

- Do not solve how Compare feels after Triage.
- Do not change sorting behavior.
- Do not add persistent onboarding state for the help dialog.
- Do not add counts, progress pressure, gamification, or discard framing.

## Proposed UX

### Tutorial

Use the existing controls, but add visible standings between rounds:

- Purpose beat: explain that the tutorial sorts a small sample collection and shows what changes after each round.
- Triage beat: "groups what you love, like, maybe, and what can move onward."
- After Triage: show the first standing from the user's Triage taps.
- Usage beat: ask the same sample collection, one item at a time, whether each piece is in your life right now.
- After Usage: show the same standing with usage notes added to each answered piece.
- Compare beat: generate pairings from the current ranked standing and show progress through the pairs.
- Standing beat: show the final standing after Compare and call out that Compare folds pair choices back into the same cumulative standing.
- Refine beat: show a small hand-order list that can be dragged or adjusted with arrow controls, matching the real draft result affordance.

### App Sort Hub

The session header gets one short explanatory line:

> Choose any round. Each one adds another layer.

Add a secondary `How sorting works` button that opens a dismissible dialog. The dialog contains a short heading, three compact round explanations, and one combination note:

- Triage groups by feeling.
- Usage adds an in-your-life note.
- Compare orders pieces by love.
- Use one, two, or all three. Each sort stacks on the others.

## Adversarial Review

### UX

Concern: A modal can become an interruption.

Decision: Make it user-opened only. Do not auto-open, do not persist nag state.

Concern: The app copy may assume the tutorial.

Decision: The hub sentence and dialog must stand alone.

Concern: The app copy may over-explain the mechanics.

Decision: In app, do not explain how the projections combine. Say only that the sorts can stack. The tutorial owns the fuller explanation.

### Tone

Concern: Explaining Usage as "use vs do not use" can become inventory/shame.

Decision: Use "in your life right now" and "resting" framing. Do not enumerate contradiction groups like "loved but unused."

Concern: Compare independence could sound like pressure to do all three rounds.

Decision: Say "Choose any round" and "work together when you use more than one."

### Design

Concern: The dialog could feel like a docs panel.

Decision: Keep it short, readable, and plain. Standard dialog pattern, no extra card grid inside the dialog.

### QA

Tests should prove:

- Tutorial purpose names the current three-round model.
- Tutorial standings show cumulative output after each round.
- Tutorial refine beat includes a visible hand-order list, not only explanatory copy.
- Sort hub renders the concise line.
- Help dialog opens and closes, and says the sorts can stack.
