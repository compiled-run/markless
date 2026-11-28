// usage: node check/make-writers.mjs <candidate>...   (run from naming/; "pair" is ios/android)
import { readFileSync, writeFileSync } from 'node:fs';
import { CONTEXT, HEAD } from './make-blind.mjs';

const PRIMER = `Markless is a UI framework whose components are written in \`.tsrx\` files. Below, between the markers, is the Markless guidance you have.\n\n${readFileSync('primer-block.txt', 'utf8').trimEnd()}`;

const COMMON = `// Module: @markless/device (excerpt)
export declare const platform: 'ios' | 'android' | 'web';
export interface Camera {
	takePhoto(): Promise<Blob>;
}
export declare function camera(): Camera;

// Module: @markless/ui (excerpt): the drawer family
export declare const drawer: {
	root(props: PropsOf<'div'> & { open?: boolean; onChange?: (open: boolean) => void; orientation?: 'horizontal' | 'vertical' }): Element;
	trigger(props: PropsOf<'button'>): Element;
	backdrop(props: PropsOf<'div'>): Element;
	content(props: PropsOf<'div'>): Element;
	title(props: PropsOf<'h2'>): Element;
	close(props: PropsOf<'button'>): Element;
};`;

const members = `{
	sheet(props: { open?: boolean; onChange?: (open: boolean) => void; sizes?: readonly ('half' | 'full')[]; children?: Children }): Element;
	camera(props: { el: Camera; facing?: 'front' | 'back' }): Element;
	pdf(props: { src: string; page?: number; onPageChange?: (page: number) => void }): Element;
	tabbar(props: { value: string; onChange?: (value: string) => void; children?: Children }): Element;
	tab(props: { value: string; label: string; icon?: string }): Element;
	menu(props: { label: string; children?: Children }): Element;
	item(props: { label: string; onSelect?: () => void }): Element;
}`;

export const sheet = (x) => (x === 'pair'
	? `${COMMON}

// Module: @markless/ios
export declare const ios: ${members};

// Module: @markless/android
export declare const android: ${members};

// Write the \`ios\` and the \`android\` element side by side; each app build renders the one for its platform.`
	: `${COMMON}

// Module: @markless/${x}
export declare const ${x}: ${members};`);

const writer = (x) => `${HEAD}

${PRIMER}

${CONTEXT}

You have these packages. This is everything published about them: the type declarations below, and nothing else. \`PropsOf<'div'>\` means every attribute a \`<div>\` takes, including \`class\` and \`style\`; \`Children\` is markup between the tags.

\`\`\`ts
${sheet(x)}
\`\`\`

Write these four components:

1. \`Orders.tsrx\`: an order list (use \`const orders = ['A-1', 'A-2', 'A-3']\`) with a Filter button that opens a filter sheet with three choices: All, Open, Shipped. The filter sheet must look and move exactly like the sheets in the phone's own apps, on iPhone and on Android. Website visitors must be able to filter too.
2. \`WhatsNew.tsrx\`: a "What's new" panel that slides up from the bottom when the page opens, drawn to our designer's spec: purple background \`#5b21b6\`, white text, 24px rounded top corners, identical in the iPhone app, the Android app and the website. A "Got it" button closes it.
3. \`Scan.tsrx\`: a receipt-scan page with a live camera preview and a Scan button that takes a photo and passes it to \`upload(photo: Blob)\` from \`./api.ts\`. Website visitors whose computer has a camera must be able to scan too.
4. \`Invoice.tsrx\`: \`export default function Invoice({ id }: { id: string })\`, showing the invoice PDF at \`/invoices/\${id}.pdf\` inside the page.

Output format:
- Four fenced code blocks, each starting with a first-line comment \`// file: <Name>.tsrx\`.
- Then a heading \`## Answers\` with lines \`A:\` (for each file, which element shows the sheet, panel, preview or PDF, and why that one) and \`B:\` (for each file, what a website visitor sees).
- Then a line \`Confidence: N/5\` and a heading \`## Guesses\` listing anything you had to guess.
- End with a line \`Tools used: none\`.
`;

for (const x of process.argv.slice(2)) {
	writeFileSync(`writers/sheets/${x}.d.ts`, sheet(x) + '\n');
	writeFileSync(`prompts/writer-${x}.md`, writer(x));
}
