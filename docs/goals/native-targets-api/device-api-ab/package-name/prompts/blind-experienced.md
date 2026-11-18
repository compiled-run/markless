You are taking part in a study of package naming. Answer from this prompt alone: do not read files, search the repository or any code, run commands, or use the web. Do not use any tools at all.

Answer as a web developer who has built websites and web apps for many years and has used several component libraries. Use the words you would naturally use.

Markless is a UI framework whose components are written in `.tsrx` files. In `.tsrx`, a component body is `@{ statements; one root element }` and runs once; `state()` values update the page when assigned; `@if`/`@else` and `@for` are template blocks. One codebase is built as an iPhone app, an Android app and a website.

Markless has a library of interface components that needs a package name, shown as `@markless/____` here. What it is:

- **Families** such as `tabs`, `modal`, `drawer`, `collapsible` and `calendar`, each a set of parts: `<tabs.root>`, `<tabs.list>`, `<tabs.trigger>`, `<tabs.content>`.
- **Single pieces** that are not families, grouped under one namespace shown as `?` here: `<?.button>`, `<?.label>`, `<?.separator>`.
- It supplies behaviour, keyboard handling, focus and accessibility, and the parts. It ships no styling: the author draws everything with their own CSS.
- It works the same in the iPhone app, the Android app and the website.
- Separately, pieces the phone's own system draws (its real sheet, its camera preview) are `native.*` from `@markless/device`. They are not in this package.

Other Markless packages already exist and their names are taken: `core`, `device`, `router`, `web`, `compiler`, `bundler`, `runtime`, `analyzer`, `icons`.

Constraints: lowercase, no separators (no dash, dot or underscore inside the name).

A. Propose your top three names for the package `@markless/____`, best first, one line each saying why.
B. Propose your top three names for the single-pieces namespace `?` (as in `<?.button>`), best first, one line each saying why.

Output format, exactly:
A1. `name`: reason
A2. `name`: reason
A3. `name`: reason
B1. `name`: reason
B2. `name`: reason
B3. `name`: reason
Tools used: none
