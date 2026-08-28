import { expect, test } from 'vitest';
import { buildSemanticGraph } from '../src/passes/semantic-graph/index.ts';

// Pins the yuku-tsrx parse boundary: a member-expression tag (<family.part>)
// cannot hold a construct in its children, while the identifier spelling can.
// The refusal comes from the JSX child parser, before any Markless pass runs.

function moduleWith(body: string) {
	return `import { state } from '@markless/core';
import { toaster } from './ui.ts';
import { ToasterRoot } from './toaster-root.ts';

export function App() @{
	let items = state(['a', 'b']);
	let open = state(true);

${body}
}`;
}

async function refusalOf(body: string) {
	try {
		await buildSemanticGraph({ filename: 'src/Dotted.tsrx', source: moduleWith(body) });
		return null;
	} catch (error) {
		return (error as Error).message;
	}
}

const CHILD_CONSTRUCT_REFUSAL = "Expected '</' to close the JSX element, but found '@'";

test('an identifier tag holds @for and @if in its children', async () => {
	expect(
		await refusalOf(`	<ToasterRoot>
		@for (const item of items) {
			<p>{item}</p>
		}
	</ToasterRoot>`),
	).toBe(null);
	expect(
		await refusalOf(`	<ToasterRoot>
		@if (open) {
			<p>x</p>
		}
	</ToasterRoot>`),
	).toBe(null);
});

test('a member-expression tag holds plain elements in its children', async () => {
	expect(
		await refusalOf(`	<toaster.root>
		<p>x</p>
	</toaster.root>`),
	).toBe(null);
});

test('a member-expression tag refuses @for in its children at the parser', async () => {
	expect(
		await refusalOf(`	<toaster.root>
		@for (const item of items) {
			<p>{item}</p>
		}
	</toaster.root>`),
	).toBe(CHILD_CONSTRUCT_REFUSAL);
});

test('a member-expression tag refuses @if in its children at the parser', async () => {
	expect(
		await refusalOf(`	<toaster.root>
		@if (open) {
			<p>x</p>
		}
	</toaster.root>`),
	).toBe(CHILD_CONSTRUCT_REFUSAL);
});

test('nesting the member-expression tag under an element does not change the refusal', async () => {
	expect(
		await refusalOf(`	<section>
		<toaster.root>
			@for (const item of items) {
				<p>{item}</p>
			}
		</toaster.root>
	</section>`),
	).toBe(CHILD_CONSTRUCT_REFUSAL);
});
