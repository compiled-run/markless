You are taking part in a study of API naming. Answer from this prompt alone: do not read files, search the repository or any code, run commands, or use the web. Do not use any tools at all.

Answer as a developer who builds phone apps for iPhone and Android. Use the words you would naturally use.

Markless is a UI framework whose components are written in `.tsrx` files. In `.tsrx`, a component body is `@{ statements; one root element }` and runs once; `state()` values update the page when assigned; `@if`/`@else`, `@try`/`@pending`/`@catch` and `@for` are template blocks. One codebase is built as an iPhone app, an Android app and a website.

A Markless page starts with this import line and uses it as shown. You have no documentation for the package.

```tsrx
import { native } from '@markless/device';

<native.sheet open={filtersOpen} onChange={(open) => (filtersOpen = open)}><Filters /></native.sheet>
<native.camera el={cam} />
<native.pdf src="/invoices/42.pdf" />
<native.tabbar value={tab} onChange={(value) => (tab = value)}>…</native.tabbar>
<native.menu label="Sort">…</native.menu>
```

Answer each in one to three sentences.

1. What do you assume the package `@markless/device` contains?
2. What else would you expect to find in it?
3. What would you be surprised to find in it?
4. Who decides how `native.sheet` looks?

Output format, exactly: lines `1:` to `4:`, then `Tools used: none`.
