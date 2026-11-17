import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// A component passed as a prop value cannot be rendered as a tag yet, so the build names the prop and the tag instead of crashing at render.

const compile = (source: string) =>
	compileTsrxModule({ filename: '/w/src/frame.tsrx', source, symbols: [] });

const refusals = async (source: string) =>
	(await compile(source)).semanticGraph.diagnostics.filter(
		(diagnostic) => diagnostic.code === 'MARKLESS_COMPONENT_PROP_TAG_UNSUPPORTED',
	);

test('a tag that renders a prop is refused, naming the prop, the component and the tag', async () => {
	const source = `export function Frame({ Body }) @{\n\t<section><Body /></section>\n}\n`;
	const [refusal, ...rest] = await refusals(source);
	expect(rest).toEqual([]);
	expect(refusal?.severity).toBe('error');
	expect(refusal?.message).toBe(
		'`<Body />` in `Frame` renders the prop `Body`, and a component passed as a prop value cannot be rendered as a tag.',
	);
	expect(source.slice(refusal!.primarySpan!.start, refusal!.primarySpan!.end)).toBe('<Body />');
});

test('a renamed prop and a tag inside an arm are refused under the prop name the caller writes', async () => {
	const source = `export function Card({ face: Face, open }) @{\n\t<article>@if (open) {<Face label="x" />}</article>\n}\n`;
	const [refusal] = await refusals(source);
	expect(refusal?.message).toBe(
		'`<Face />` in `Card` renders the prop `face`, and a component passed as a prop value cannot be rendered as a tag.',
	);
	expect(source.slice(refusal!.primarySpan!.start, refusal!.primarySpan!.end)).toBe('<Face label="x" />');
});

test('a component of the same name is not mistaken for the prop', async () => {
	const imported = await refusals(
		`import { Body } from './body.tsrx';\n\nexport function Frame({ Body: content }) @{\n\t<section><Body />{content}</section>\n}\n`,
	);
	const sibling = await refusals(
		`import { Body } from './body.tsrx';\n\nfunction Holder({ Body }) @{\n\t<p>{String(!!Body)}</p>\n}\n\nexport function Frame() @{\n\t<section><Holder Body={1} /><Body /></section>\n}\n`,
	);
	const local = await refusals(
		`function Body() @{\n\t<b>body</b>\n}\n\nexport function Frame({ items }) @{\n\t<ul>@for (const item of items; key item) {<li><Body /></li>}</ul>\n}\n`,
	);
	expect([imported, sibling, local]).toEqual([[], [], []]);
});

test('children, a callback and plain values passed as props still build', async () => {
	const result = await compile(
		`import { state } from '@markless/core';\n\nfunction Panel({ title, onPick, children }) @{\n\t<section>\n\t\t<h2>{title}</h2>\n\t\t<button type="button" onClick={() => onPick(title)}>pick</button>\n\t\t{children}\n\t</section>\n}\n\nexport function Frame() @{\n\tlet picked = state('');\n\n\t<Panel title="one" onPick={(name) => (picked = name)}>\n\t\t<p>{picked}</p>\n\t</Panel>\n}\n`,
	);
	expect(result.semanticGraph.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
});
