// usage: node check/make-blind.mjs   (run from naming/)
import { writeFileSync } from 'node:fs';

export const HEAD = 'You are taking part in a study of API naming. Answer from this prompt alone: do not read files, search the repository or any code, run commands, or use the web. Do not use any tools at all.';
export const CONTEXT = 'Markless is a UI framework whose components are written in `.tsrx` files. In `.tsrx`, a component body is `@{ statements; one root element }` and runs once; `state()` values update the page when assigned; `@if`/`@else`, `@try`/`@pending`/`@catch` and `@for` are template blocks. One codebase is built as an iPhone app, an Android app and a website.';
export const PERSONA = {
	web: 'Answer as a web developer who has built websites and web apps for years and has never built a phone app. Use the words you would naturally use.',
	native: 'Answer as an iOS or Android developer who builds phone apps with Swift and SwiftUI or Kotlin and Jetpack Compose. Use the words you would naturally use.',
	expo: 'Answer as a React Native developer who builds apps with Expo for iPhone, Android and the web. Use the words you would naturally use.',
	mobile: 'Answer as a developer who builds phone apps for iPhone and Android. Use the words you would naturally use.',
};

const blind = (persona) => `${HEAD}

${PERSONA[persona]}

${CONTEXT}

In Markless an author chooses between two kinds of markup:

- **Headless families from \`@markless/ui\`**, such as \`modal\`, \`drawer\` and \`tabs\`: the author draws them, and they look the same on each platform. Example: \`<drawer.root open={open}> … </drawer.root>\`.
- **The platform's own version**: the platform's real sheet (the author's markup inside the platform's frame, with the platform's drag and motion), the camera preview, a PDF view, the platform's tab bar, the platform's menu. In the website build it is the browser's own equivalent where one exists.

The second kind needs a namespace name, shown as \`____\` here:

\`\`\`tsrx
<____.sheet open={filtersOpen} onChange={(open) => (filtersOpen = open)}><Filters /></____.sheet>
<____.camera el={cam} />
<____.pdf src="/invoices/42.pdf" />
<____.tabbar value={tab} onChange={(value) => (tab = value)}>…</____.tabbar>
<____.menu label="Sort">…</____.menu>
\`\`\`

Constraints: lowercase, no separators (no dash, dot or underscore inside the name). These are already taken and cannot be used: \`platform\` (a value that says which build the code is in, for checks such as \`platform === 'ios'\`), \`device\` (the package of device calls such as \`camera()\` and \`sharesheet.open()\`), \`base\` (reads as headless), and the names of \`@markless/ui\` families (\`modal\`, \`drawer\`, \`tabs\`, \`menu\` and so on).

Propose your top three names for \`____\`, best first. For each, give one line saying why.

Output format, exactly:
1. \`name\`: reason
2. \`name\`: reason
3. \`name\`: reason
Tools used: none
`;

for (const p of ['web', 'native', 'expo']) writeFileSync(`prompts/blind-${p}.md`, blind(p));
