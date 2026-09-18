Mobile-first finance tracker redesign

Context

ui-ux-redesign.md identifies an information-architecture problem: the authenticated dashboard currently reads like a desktop report compressed into a phone. Balance information, bill alerts, transaction entry, and history are separated by calendars and analytics, while month controls are duplicated and data rows become unnecessarily tall on mobile.

This change will reorganize the existing React dashboard around the most frequent mobile tasks without changing its Firebase data model, transaction validation, undo behavior, chart implementation, or teal semantic palette.

Recommended approach

- Do not add a router, UI library, chart library, test framework, or new state-management dependency.                                     se stable sectione scrollIntoView()navigation.                                                      how the four-iteme mobile breakpoint.
- Reuse TransactionForm inside an accessible transaction sheet; do uplicate its vali
- Keep reminders, savings, credit cards, and analytics functional, efer secondary coerts, quick actions, andrecent transactions.
- Preserve the user’s existing uncommitted changes in src/App.css; it diff before edinto that work ratherthan replacing it.

Implementation plan                                                
1. Establish shared month navigation                               
1. Add src/components/MonthSelector.tsx.                           - Receive year, m
   - Render one accessible month heading and 44px previous/next controls.
   - Use the existing monthLabel() utility.                        Add src/lib/scrol
   - Resolve an element by ID.
   - Scroll with behavior: 'smooth' by default and auto when prefers-reduced-motion is set.
   - Focus the target when it is focusable.                        In src/componentselector immediately below the top bar and before the loading branch so it remains availablwhile data loads.
4. Remove onPrev and onNext from MonthSummary and FinanceCalendar, including their d
5. Keep onSelectMonth in MonthSummary for the balance-outlook month picker.                                                         Replace the direc) call with the sharedscroll helper.
                                                                   Reorder the signe

Change the main composition in LedgerApp.tsx to this order:        
1. Header
2. Sticky month selector                                           Overview / monthl
4. Attention banner and compact upcoming-bill preview
5. Quick actions                                                   Recent transactio
7. Full bill reminders
8. Calendar                                                        Savings track
10. Credit cards
11. Collapsible secondary analytics                                 Mobile bottom na
                                                                   ign stable IDs:

- overview                                                         ransactions
- reminders
- calendar                                                         avings
- credit-cards
- analytics                                                        
Preserve the existing focus-restoration heading IDs: list-heading, inders-heading, sg. Remove the current.workspace grid once the inline transaction form moves into the she
3. Surface attention before quick actions
                                                                   LedgerApp.tsx, deinders from the existingreminders data.

Render a compact attention region inside Overview when needed:
                                                                   how the number of
- List up to three overdue/due-soon bills with name, status, due damount.
- Provide a Review bills action that scrolls to reminders.         se amber/red only

This provides the required early alert and upcoming-bill visibilityhout moving the fahead of recenttransactions.
                                                                   Add task-oriented

Add src/components/QuickActions.tsx with:

- Add transaction — opens the transaction sheet.                   eview bills — scr
- Calendar — scrolls to calendar.                                  istory — scrolls
                                                                    one row on desktobile. Every action musthave a minimum 44px target, at least 8px separation, visible focus, an accessible name, and existing Lucide icon semantics. The Add actioneive the stronges

5. Add mobile bottom navigation

Add src/components/MobileBottomNav.tsx with Overview, Calendar, Addtory.
                                                                   avior:
                                                                   ide above the mob
- Use an IntersectionObserver over the primary sections to reflect the visible destination.                                             et aria-current="
- Scroll to Overview, Calendar, or History on selection.
- Open the transaction sheet from Add.                             o not modify the

CSS requirements:                                                  
- Fixed bottom placement.
- Solid/blurred surface that prevents content showing through.     nv(safe-area-inse
- Sufficient .app bottom padding so the final section is never obscured.
- Z-index below the transaction sheet but coordinated with the Undo
6. Move transaction entry into an accessible sheet
                                                                    src/components/Tr the existingTransactionForm inside it.                                         
Required behavior:                                                 
- Mobile: bottom sheet with a clear drag-handle visual and safe-area padding.                                                         esktop: centered
- role="dialog", aria-modal="true", and aria-labelledby="form-heading".
- Trap Tab/Shift+Tab, close on Escape and backdrop click, lock bodycroll, and restorer.
- Include a visible close control.
- Key the embedded form by editing transaction ID so edit state caneak into Add mode
                                                                   LedgerApp.tsx:
                                                                   dd transactionShe
- Add open/close helpers.
- Opening an Edit action should open the sheet in edit mode.       uccessful add/ediar editing state, andrestore focus.
- Logout should close the sheet and dismiss Undo.

In TransactionForm.tsx:                                            
- Preserve all fields, type tabs, savings direction, credit-card   election, validat
- Add autoFocus to the amount field for fast entry.                eep onCancelEdit h.
                                                                   Keep transaction

Update TransactionList.tsx markup/classes so mobile rows remain    izontal:

- Left side: type badge, category/credit-card metadata, description, and date.                                                            ight side: prominelete controls.
- Allow only text metadata to wrap; do not move amount/actions ontoeparate row.
- Keep sorting and the accessible sort dropdown unchanged.         
In App.css:
                                                                   emove the mobile or .tx-item.
- Hide the desktop sort-header row on narrow screens.
- Make edit/delete targets at least 44px with 8px separation.
- Prevent long category, card, and description text from forcing horizontal page scrolling.                                       
For BillReminders.tsx, prefer a CSS-first compact-row treatment:   
- Keep status, name, and due metadata on the left.                 eep amount and ac
- Allow descriptions and metadata to wrap without turning the whole row into a column.                                                   pply the same 44p

8. Defer secondary analytics                                       
Add src/components/AnalyticsSection.tsx.
                                                                   tart collapsed onop.
- Use a native details/summary pattern or an equivalent button with aria-expanded.                                                   ive the summary anded/collapsed state.
- Render SpendingStats and SavingsStats only while expanded.
- Pass the existing raw transaction data and month context from Ledeep all chart mar

Remove the top-level spending/savings statistics composition from thboard. Keep Balailization history astheir existing on-demand collapsible interactions.                 
In MonthSummary.tsx, make the credit-card snapshot secondary on mobile—prefer a collapsed region or hide the duplicate snapshot at ile breakpoint wh Cards section later inthe page.
                                                                   Apply the visual

Update src/App.css using the existing design tokens:               
- Use one primary surface for major sections and subtle separators f repeated nested
- Make the running balance the dominant Overview value.            eep all financialic: tabular-nums.
- Reserve saturated teal, amber, blue, and red for meaningful statudd consistent moberarchy.
- Add scroll-margin-top to every anchored section so the sticky selector cannot cover headings.                                           dd mobile bottom and position Undo aboveit.
- Add restrained sheet/summary transitions with reduced-motion overrides.
- Fix the existing malformed CSS declarations found around the credtyles (white-spacht values ending in aperiod) while touching this file.                                o not introduce rt/dark contrast checkproves an existing semantic token unusable.                      
10. Accessibility and responsive acceptance criteria               
Verify and retain:
                                                                   4×44px minimum tos.
- 8px minimum separation between adjacent action targets.
- Visible keyboard focus throughout.
- Accessible labels/tooltips for icon-only controls.               estructive transamain distinct and retainUndo.                                                            afe-area support tom sheet.
- Reduced-motion-aware scrolling and transitions.                  o horizontal page
- Readable status colors in both light and dark themes.            onth changes updaar, savings, creditcards, and analytics consistently.
                                                                   tical files

Primary composition and behavior:

- src/components/LedgerApp.tsx                                     rc/components/Tra
- src/components/TransactionList.tsx                               rc/components/Mon
- src/components/FinanceCalendar.tsx                               rc/components/Bil
- src/App.css
                                                                    files:

- src/components/MonthSelector.tsx                                 rc/components/Qui
- src/components/MobileBottomNav.tsx
- src/components/TransactionSheet.tsx                              rc/components/Ana
- src/lib/scrollToSection.ts
                                                                   /index.css shouldokens, focus behavior,and reduced-motion defaults unless a theme contrast defect requires a token correction.                                                  
Verification                                                       
1. Inspect the existing src/App.css diff before making changes and preserve unrelate
2. Run npm run lint.                                               Run npm run build
4. Run git diff --check.
5. Manually verify at 360×800, 390×844, 768×1024, and desktop widthboth themes.
6. Exercise month changes, all bottom-nav destinations, quick actions, Add/Edit/Cancel, Escape, backdrop close, focus restoration, sorting, delete Undo, reminder actions, analytics expansion, credit-card navigation, keybo mode.

No automated test fred, so build, lint, diffchecks, and the responsive/accessibility matrix are the appropriate   verification boundar