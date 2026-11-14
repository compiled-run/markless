import { expect, test } from 'vitest';
import { collectTsrxModuleDiagnostics, compileTsrxModule } from '../src/index.ts';

// An expression reading into a prop names where it sits, the prop, and a rewrite that updates.
async function staticWarnings(markup: string) {
	const result = await compileTsrxModule({
		filename: '/app/badge.tsrx',
		source: `const classFor = (label: string) => (label.endsWith('1') ? 'badge odd' : 'badge');
export function Badge({ label, note, size }: { readonly label: string; readonly note: string; readonly size: number }) @{
	${markup}
}
`,
		symbols: [],
	});
	return collectTsrxModuleDiagnostics(result)
		.filter((diagnostic) => diagnostic.code === 'MARKLESS_TEMPLATE_EXPRESSION_STATIC')
		.map((diagnostic) => [diagnostic.message, diagnostic.suggestions?.[0]?.message]);
}

test.fails('a ternary class over a method call on a prop names the class attribute and the prop', async () => {
	const [[message, suggestion] = []] = await staticWarnings(
		`<span class={label.endsWith('1') ? 'badge odd' : 'badge'}>{label}</span>`,
	);
	expect(message).toContain('This class attribute reads into the prop `label`');
	expect(message).not.toContain('This text');
	expect(suggestion).toContain('`class={classFor(label)}`');
});

test.fails('an attribute and a text over a prop member name their own place', async () => {
	expect((await staticWarnings(`<a title={label.length > 2 ? 'long' : 'short'}>x</a>`))[0]?.[0]).toContain(
		'This title attribute reads into the prop `label`',
	);
	expect((await staticWarnings(`<p>{label.toUpperCase()}</p>`))[0]?.[0]).toContain(
		'This text reads into the prop `label`',
	);
});


test.fails('every prop the expression reads into, and every prop it reads, is named', async () => {
	const [[message, suggestion] = []] = await staticWarnings(
		`<span title={label.length > note.length ? 'long' : size}>{label}</span>`,
	);
	expect(message).toContain('This title attribute reads into the props `label` and `note`');
	expect(message).toContain('never changes when `label`, `note` or `size` changes');
	expect(suggestion).toContain('`title={valueFor(label, note)}`');
});
