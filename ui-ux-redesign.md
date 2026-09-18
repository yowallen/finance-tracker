# UI/UX Redesign Brief

## Verdict

The finance tracker is functionally capable, but its mobile experience currently feels like a desktop dashboard compressed into a narrow viewport. The main issue is not the color palette or individual components; it is information architecture. Too many sections compete for attention in one long scrolling page, while the most frequent actions are not easy to reach.

The redesign should make the app task-oriented on small screens:

- See the current financial position quickly.
- Capture a transaction with minimal friction.
- Find upcoming bills and reminders.
- Review and correct recent transactions.
- Open deeper analytics only when needed.

## Highest-Priority Problems

### 1. Excessive mobile scrolling

The home view presents the monthly summary, balance outlook, calendar, spending statistics, savings statistics, reminders, savings track, credit cards, transaction form, and transaction history in one linear sequence.

This makes common workflows feel buried and causes users to lose their place.

**Recommendation:** Prioritize the balance, alerts, quick actions, and recent transactions. Move secondary analytics into collapsible sections or dedicated views.

### 2. No mobile section navigation

There is no persistent navigation for moving between Overview, Calendar, Add Transaction, and History. Users must repeatedly swipe through the full dashboard.

**Recommendation:** Add a mobile navigation pattern with four primary destinations:

- Overview
- Calendar
- Add
- History

Savings, Reminders, and Credit Cards can remain reachable from Overview or secondary navigation.

### 3. Add Transaction is not treated as a primary action

Adding a transaction is likely one of the most frequent tasks, but the form is placed after most dashboard sections.

**Recommendation:** Add a prominent mobile Add action. Open the transaction form in a bottom sheet, modal, or focused expandable panel while preserving the current form logic.

### 4. Data rows become too tall on mobile

Transaction and reminder rows switch to a column layout at the mobile breakpoint. This increases row height and reduces the amount of useful information visible at once.

**Recommendation:** Keep the amount and action controls aligned to the right. Allow only the description and metadata to wrap below the primary row content.

### 5. Repeated month navigation

Both the monthly summary and finance calendar provide previous and next month controls for the same state.

**Recommendation:** Keep one shared month navigation control near the top. The calendar should use the selected month without repeating the navigation UI.

### 6. Analytics compete with action

The current layout gives substantial visual priority to charts, outlook cards, and snapshots before the user reaches reminders and transaction history.

**Recommendation:** Use this mobile order:

1. Current balance and month selector
2. Attention items and upcoming bills
3. Quick actions
4. Recent transactions
5. Calendar
6. Savings and credit card analytics

## Touch And Accessibility Requirements

- Keep every mobile tap target at least 44px by 44px.
- Keep at least 8px of separation between adjacent action targets.
- Preserve visible keyboard focus indicators.
- Keep accessible labels and tooltips on icon-only controls.
- Ensure destructive actions remain visually distinct and retain the Undo flow.
- Check both light and dark themes for contrast, especially status-colored controls.
- Respect safe-area insets for any fixed bottom navigation or bottom sheet.
- Support reduced motion for page transitions and expanding sections.

## Recommended Mobile Structure

```text
App shell
  Header: brand, theme, account actions
  Sticky month selector
  Overview
    Running balance
    Income / expenses / bills summary
    Attention banner
    Quick actions
  Recent transactions
  Upcoming reminders
  Calendar
  Savings track
  Credit cards
  Secondary analytics
  Bottom navigation
    Overview | Calendar | Add | History
```

## Visual Direction

The existing teal semantic palette is coherent and can be retained. The redesign should reduce the number of filled colored containers so color communicates status instead of decorating every card.

Recommended visual adjustments:

- Use one primary surface for most sections instead of stacking many nested cards.
- Reserve saturated teal, amber, blue, and red for meaningful states.
- Use stronger spacing and typography hierarchy instead of more borders and shadows.
- Keep financial amounts tabular and visually prominent.
- Preserve the existing icon language from `lucide-react`.
- Keep row actions compact visually, but provide at least 44px touch areas on coarse pointers.

## Implementation Roadmap

### Phase 1: Mobile usability foundation

- Add mobile quick actions.
- Add sticky month navigation.
- Add section IDs and mobile navigation anchors.
- Increase mobile action hit areas.
- Keep transaction and reminder rows compact.

### Phase 2: Information architecture

- Reorder mobile sections around frequent tasks.
- Collapse or defer analytics sections.
- Remove duplicate month navigation.
- Move Add Transaction into a mobile-focused sheet or expandable panel.

### Phase 3: Visual refinement

- Simplify nested card surfaces.
- Tune typography for financial values and metadata.
- Audit light and dark theme contrast.
- Add restrained transitions for sheets, navigation, and expandable analytics.

## Success Criteria

The redesign should make these tasks feel immediate on a phone:

- Open the current month and understand the balance within a few seconds.
- Add a transaction without scrolling through the full dashboard.
- Find and act on an upcoming reminder quickly.
- Locate recent transaction history without searching through analytics.
- Edit or delete an item without missed taps.
- Move between primary areas without losing context.

## Current Technical Context

The app is a React + TypeScript + Vite application. The main composition is in `src/components/LedgerApp.tsx`, while responsive layout and component styling are primarily in `src/App.css`.

Relevant surfaces include:

- `src/components/MonthSummary.tsx`
- `src/components/FinanceCalendar.tsx`
- `src/components/BillReminders.tsx`
- `src/components/SavingsGoals.tsx`
- `src/components/TransactionForm.tsx`
- `src/components/TransactionList.tsx`

## References

- [WCAG 2.2 Target Size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- [Nielsen Norman Group: Mobile UX](https://www.nngroup.com/articles/mobile-ux/)
- [Nielsen Norman Group: Jakob's Law](https://www.nngroup.com/articles/jakobs-law/)
