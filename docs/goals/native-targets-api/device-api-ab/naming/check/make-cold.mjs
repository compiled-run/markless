// usage: node check/make-cold.mjs <candidate>...   (run from naming/; "pair" is ios/android)
import { writeFileSync } from 'node:fs';
import { CONTEXT, HEAD, PERSONA } from './make-blind.mjs';

const tag = (x, el, attrs, body) => (x === 'pair'
	? ['ios', 'android'].map((n) => body === undefined ? `<${n}.${el}${attrs} />` : `<${n}.${el}${attrs}>${body}</${n}.${el}>`)
	: [body === undefined ? `<${x}.${el}${attrs} />` : `<${x}.${el}${attrs}>${body}</${x}.${el}>`]);
const ind = (lines, n) => lines.map((l) => '\t'.repeat(n) + l).join('\n');

export function page(x) {
	const imports = x === 'pair'
		? "import { android } from '@markless/android';\nimport { ios } from '@markless/ios';"
		: `import { ${x} } from '@markless/${x}';`;
	const pdf = tag(x, 'pdf', ' src={`/statements/${shown}`}');
	const pdfBlock = pdf.length === 1 ? ind(pdf, 5) : `\t\t\t\t\t<>\n${ind(pdf, 6)}\n\t\t\t\t\t</>`;
	return `import { state } from '@markless/core';
import { camera } from '@markless/device';
import { drawer, tabs } from '@markless/ui';
${imports}
import { Filters } from './Filters.tsrx';

export default function Receipts() @{
	let tab = state('scan');
	let filtersOpen = state(false);
	let tipsOpen = state(false);
	let shown = state<string | null>(null);
	const cam = camera();

	<main>
		<tabs.root value={tab} onChange={(value) => (tab = value)}>
			<tabs.list>
				<tabs.trigger value="scan">Scan</tabs.trigger>
				<tabs.trigger value="saved">Saved</tabs.trigger>
			</tabs.list>
			<tabs.content value="scan">
${ind(tag(x, 'camera', ' el={cam}'), 4)}
				<button onClick={() => cam.takePhoto()}>Scan receipt</button>
			</tabs.content>
			<tabs.content value="saved">
				<button onClick={() => (filtersOpen = true)}>Filter</button>
				<button onClick={() => (shown = 'march.pdf')}>March statement</button>
				@if (shown) {
${pdfBlock}
				}
			</tabs.content>
		</tabs.root>

${ind(tag(x, 'sheet', ' open={filtersOpen} onChange={(open) => (filtersOpen = open)}', '\n\t\t\t<Filters />\n\t\t').map((s) => s.replace(/\n\t\t</, '\n<')), 2).replace(/\n\t\t\t\t<Filters/g, '\n\t\t\t<Filters').replace(/\n<\//g, '\n\t\t</')}

		<drawer.root open={tipsOpen} onChange={(open) => (tipsOpen = open)}>
			<drawer.trigger>Scanning tips</drawer.trigger>
			<drawer.backdrop>
				<drawer.content>
					<drawer.title>Scanning tips</drawer.title>
					<p>Flatten the receipt and fill the frame.</p>
					<drawer.close>Got it</drawer.close>
				</drawer.content>
			</drawer.backdrop>
		</drawer.root>
	</main>
}
`;
}

export const label = (x) => (x === 'pair' ? '`ios` and `android`' : `\`${x}\``);
const el = (x, e) => (x === 'pair' ? `\`ios.${e}\` / \`android.${e}\`` : `\`${x}.${e}\``);

const cold = (x, persona) => `${HEAD}

${PERSONA[persona]}

${CONTEXT}

Here is one page from a Markless app. You have no documentation for any of the packages it imports.

\`\`\`tsrx
// file: Receipts.tsrx
${page(x).trimEnd()}
\`\`\`

Answer each question in two to four sentences. If you are unsure, give your best reading and say how sure you are.

1. What ${x === 'pair' ? 'are' : 'is'} ${label(x)}?
2. Where ${x === 'pair' ? 'do they' : 'does it'} come from?
3. Who decides how the filter sheet (${el(x, 'sheet')}) looks and moves in the iPhone app and in the Android app?
4. What does a visitor to the website get for each of ${el(x, 'sheet')}, ${el(x, 'camera')} and ${el(x, 'pdf')}?
5. How is ${el(x, 'sheet')} different from the \`drawer\` on the same page?
6. Would you expect ${el(x, 'button')} to exist? Why or why not?

Output format, exactly: lines starting \`1:\` to \`6:\`, then a line \`Confidence: N/5\` (how sure you are of your answers overall), then \`Tools used: none\`.
`;

for (const x of process.argv.slice(2)) {
	writeFileSync(`cold/pages/${x}.tsrx`, page(x));
	for (const p of ['web', 'mobile']) writeFileSync(`prompts/cold-${x}-${p}.md`, cold(x, p));
}
