import { expect, test } from 'vitest';
import {
	addQuickInfoHovers,
	addTsrxHovers,
	getHighlighter,
	signaturePainter,
} from './highlight-code.ts';
import { plainDoc } from './twoslash-quickinfo.ts';
import { ColourTable, DocRegistry, paneLines } from './ui-code-runs.ts';

test('a type hover paints its signature in the code colours, and the doc stays plain text', async () => {
	const paint = signaturePainter(await getHighlighter());
	const html = addQuickInfoHovers(
		'<span style="color:#24292E">count</span>',
		'count',
		[{ start: 0, length: 5, signature: 'const count: number', doc: 'How many.' }],
		paint,
	);
	const title = /<span class="tsrx-tip-title">(.*?)<\/span><span class="tsrx-tip-body">/.exec(
		html,
	)![1]!;
	expect(title).toContain(
		'<span class="tsrx-tip-code" style="color:#D73A49;--shiki-dark:#F97583">const</span>',
	);
	expect(title.replace(/<[^>]*>/g, '')).toBe('const count: number');
	expect(html).toContain('<span class="tsrx-tip-body">How many.</span>');
	expect(html).toContain('aria-label="const count: number. How many."');
});

test('a token named in a painted signature does not grow a hover of its own inside the tip', async () => {
	const paint = signaturePainter(await getHighlighter());
	const typed = addQuickInfoHovers(
		'<span style="color:#24292E">x</span>',
		'x',
		[{ start: 0, length: 1, signature: 'const x: typeof state', doc: '' }],
		paint,
	);
	expect(addTsrxHovers(typed).match(/class="tsrx-hover"/g)).toHaveLength(1);
});

test('a TSRX keyword hover shows the keyword in the code face beside its kind', () => {
	const html = addTsrxHovers('<span style="color:#D73A49">state</span>');
	expect(html).toMatch(
		/<span class="tsrx-tip-title"><span class="tsrx-tip-code">state<\/span> · [^<]+<\/span>/,
	);
});

test('a doc comment reads as plain sentences, with its backticked names in the code face', async () => {
	const doc = plainDoc(
		'The **`ResizeObserver`** interface reports changes.\n\n[MDN Reference](https://developer.mozilla.org/docs/Web/API/ResizeObserver)',
	);
	expect(doc).toBe('The `ResizeObserver` interface reports changes.');
	expect(plainDoc('See [the guide](https://x.dev/g) first.')).toBe('See the guide first.');
	const html = addQuickInfoHovers(
		'<span style="color:#24292E">ro</span>',
		'ro',
		[{ start: 0, length: 2, signature: 'var ro: ResizeObserver', doc }],
		signaturePainter(await getHighlighter()),
	);
	expect(html).toContain(
		'<span class="tsrx-tip-body">The <span class="tsrx-tip-code">ResizeObserver</span> interface reports changes.</span>',
	);
	expect(html).toContain(
		'aria-label="var ro: ResizeObserver. The ResizeObserver interface reports changes."',
	);
});

test('a card hover keeps its signature colours as runs, and the tip copy still never becomes code', () => {
	const registry = new DocRegistry('t');
	const colours = new ColourTable();
	const html =
		'<pre><code><span style="color:#24292E"><span class="tsrx-hover" tabindex="0" role="img" aria-label="x" data-doc-title="const x: number" data-doc="">x' +
		'<span class="tsrx-tip" aria-hidden="true"><span class="tsrx-tip-title"><span class="tsrx-tip-code" style="color:#D73A49;--shiki-dark:#F97583">const</span>' +
		'<span class="tsrx-tip-code" style="color:var(--ink);--shiki-dark:var(--ink)"> x: number</span></span><span class="tsrx-tip-body"></span></span></span></span></code></pre>';
	const lines = paneLines(html, registry, colours);
	expect(lines[0]!.runs.map((run) => run.text)).toEqual(['x']);
	expect(registry.docs[0]!.sig).toEqual([
		{
			id: 's0',
			text: 'const',
			class: `${colours.classFor('color:#D73A49;--shiki-dark:#F97583')} tsrx-tip-code`,
		},
		{
			id: 's1',
			text: ' x: number',
			class: `${colours.classFor('color:var(--ink);--shiki-dark:var(--ink)')} tsrx-tip-code`,
		},
	]);
});

test('a doc pointed at twice keeps one copy of its title runs', () => {
	const registry = new DocRegistry('t');
	const token =
		'<span class="tsrx-hover" data-doc-title="state · Watched value" data-doc="d">state<span class="tsrx-tip"><span class="tsrx-tip-title"><span class="tsrx-tip-code">state</span> · Watched value</span><span class="tsrx-tip-body">d</span></span></span>';
	paneLines(`<pre><code>${token} ${token}</code></pre>`, registry, new ColourTable());
	expect(registry.docs[0]!.sig).toEqual([
		{ id: 's0', text: 'state', class: 'tsrx-tip-code' },
		{ id: 's1', text: ' · Watched value' },
	]);
});
