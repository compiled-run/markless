You are a grader in an API-design study. Read ONLY files inside /tmp/navab4/score/blind/. Do not read anything else, do not search the repository, do not use the web.

Writers were given no API for a feature and invented one. prompt-q1.md is the prompt for a modal sheet (Q1); prompt-q2.md is the prompt for a phone tab bar (Q2). answers/q1-W<n>.md and answers/q2-W<n>.md are the 16 answers. Judge each answer only by what it says and by the rules in its own prompt's signature sheet, plus its own invented API.

Q1 categories for where the decision "this is a sheet" lives:
- caller: the link or navigate() call says so (for example `<Link present="sheet">`).
- route: the page that is shown says so (for example `export const presentation = 'sheet'`).
- dialog: no route; a component in the opening page's markup, opened by state.
- mixed: routes for some sheets and in-page components for others, by a stated rule.
- other: describe it.

For each Q1 answer give:
- category, and the invented names quoted (exports, props, file conventions).
- cartLinks: how many of the three cart entry points (Home, product page, Orders) open the cart as a sheet under the writer's own API.
- addressReturn: how the chosen address in task 3 reaches checkout (for example "storage key", "local state", "query param"), and works: true if it works on a phone under the sheet's rules (storage crosses screens; state and shared do not; code after navigate() or back() in the same handler does not run), else false with the reason.
- secondStep: how task 4's second step is done ("state inside the sheet", "pushed route inside the sheet", other).
- confirm: what task 2's confirmation uses (for example "modal family", "sheet route", other).
- notification: the path the notification carries and whether, under the writer's API, the cart then shows as a sheet (true/false).
- violations: uses that break the given signature sheet's rules (not the invented API), each quoted with the rule broken. Code after navigate() or back() in the same handler counts.
- confidence: the writer's N from "Confidence: N/5".

Q2 categories for where the list of tabs lives:
- config: app configuration.
- navMarkup: each page's own markup (a `<nav>` of links or similar repeated on pages).
- family: a component family from @markless/ui in markup.
- routeExport: one export per tab's route file.
- appFile: one app-level file or component that lists every tab.
- other: describe it.

For each Q2 answer give:
- category, and the invented names quoted.
- hideBar: how /checkout hides the bar ("page export", "prop listing paths", "rule: bar only on tab roots", other).
- badge: where the number lives and how it resets (quote).
- conditionalTab: how the Account tab comes and goes.
- web: what the website shows for the tab list ("same component renders a nav", "hand-written web nav", "nothing", other).
- fourthTab: the places the writer says to edit to add a fourth tab, as a count and a list.
- violations: as for Q1.
- confidence: the writer's N.

Write JSON to /tmp/navab4/score/blind/out/GRADER.json with this shape:
{"q1-W1":{"category":"","names":[],"cartLinks":3,"addressReturn":"","works":true,"secondStep":"","confirm":"","notificationPath":"","notificationSheet":true,"violations":[],"confidence":3,"notes":""},…,"q2-W1":{"category":"","names":[],"hideBar":"","badge":"","conditionalTab":"","web":"","fourthTab":{"count":0,"places":[]},"violations":[],"confidence":3,"notes":""},…}

Then reply with only the file path and one line per question giving the count of answers in each category.
