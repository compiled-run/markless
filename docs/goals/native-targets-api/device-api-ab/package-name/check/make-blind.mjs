// usage: node check/make-blind.mjs   (run from package-name/)
import { writeFileSync } from 'node:fs';
import { CONTEXT, HEAD, PERSONA } from './common.mjs';

const blind = (persona) => `${HEAD}

${PERSONA[persona]}

${CONTEXT}

Markless has a library of interface components that needs a package name, shown as \`@markless/____\` here. What it is:

- **Families** such as \`tabs\`, \`modal\`, \`drawer\`, \`collapsible\` and \`calendar\`, each a set of parts: \`<tabs.root>\`, \`<tabs.list>\`, \`<tabs.trigger>\`, \`<tabs.content>\`.
- **Single pieces** that are not families, grouped under one namespace shown as \`?\` here: \`<?.button>\`, \`<?.label>\`, \`<?.separator>\`.
- It supplies behaviour, keyboard handling, focus and accessibility, and the parts. It ships no styling: the author draws everything with their own CSS.
- It works the same in the iPhone app, the Android app and the website.
- Separately, pieces the phone's own system draws (its real sheet, its camera preview) are \`native.*\` from \`@markless/device\`. They are not in this package.

Other Markless packages already exist and their names are taken: \`core\`, \`device\`, \`router\`, \`web\`, \`compiler\`, \`bundler\`, \`runtime\`, \`analyzer\`, \`icons\`.

Constraints: lowercase, no separators (no dash, dot or underscore inside the name).

A. Propose your top three names for the package \`@markless/____\`, best first, one line each saying why.
B. Propose your top three names for the single-pieces namespace \`?\` (as in \`<?.button>\`), best first, one line each saying why.

Output format, exactly:
A1. \`name\`: reason
A2. \`name\`: reason
A3. \`name\`: reason
B1. \`name\`: reason
B2. \`name\`: reason
B3. \`name\`: reason
Tools used: none
`;

for (const p of ['beginner', 'experienced', 'mobile']) writeFileSync(`prompts/blind-${p}.md`, blind(p));
