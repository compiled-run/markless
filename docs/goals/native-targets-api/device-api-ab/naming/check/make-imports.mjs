// usage: node check/make-imports.mjs <name>...   (run from naming/) — one prompt per name, package and framing
import { writeFileSync } from 'node:fs';
import { CONTEXT, HEAD, PERSONA } from './make-blind.mjs';

const usage = (x) => `<${x}.sheet open={filtersOpen} onChange={(open) => (filtersOpen = open)}><Filters /></${x}.sheet>
<${x}.camera el={cam} />
<${x}.pdf src="/invoices/42.pdf" />
<${x}.tabbar value={tab} onChange={(value) => (tab = value)}>…</${x}.tabbar>
<${x}.menu label="Sort">…</${x}.menu>`;

const prompt = (x, pkg, p) => `${HEAD}

${PERSONA[p]}

${CONTEXT}

A Markless page starts with this import line and uses it as shown. You have no documentation for the package.

\`\`\`tsrx
import { ${x} } from '${pkg}';

${usage(x)}
\`\`\`

Answer each in one to three sentences.

1. What do you assume the package \`${pkg}\` contains?
2. What else would you expect to find in it?
3. What would you be surprised to find in it?
4. Who decides how \`${x}.sheet\` looks?

Output format, exactly: lines \`1:\` to \`4:\`, then \`Tools used: none\`.
`;

for (const x of process.argv.slice(2)) {
	for (const [tag, pkg] of [['own', `@markless/${x}`], ['ui', '@markless/ui'], ['device', '@markless/device']]) {
		for (const p of ['web', 'mobile']) writeFileSync(`prompts/import-${x}-${tag}-${p}.md`, prompt(x, pkg, p));
	}
}
