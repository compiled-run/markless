import { expect, test } from 'vitest';
import { buildSemanticGraphSync } from '../src/passes/semantic-graph/index.ts';

const CODE = 'MARKLESS_ASYNC_ARIA_BUSY_MANAGED';

function errors(source: string) {
	return buildSemanticGraphSync({ filename: 'page.tsrx', source }).diagnostics.filter(
		(diagnostic) => diagnostic.code === CODE,
	);
}

function spanText(source: string, span: { start: number; end: number } | undefined) {
	return span ? source.slice(span.start, span.end) : undefined;
}

const results = (listAttributes: string, extra = '', outside = '') => `import { computed, state } from '@markless/core';

export function Results() @{
	let query = state('');
	let saving = state(false);
	const found = computed(async () => {
		const q = query;
		const response = await fetch('/search?q=' + q);
		return { q, items: (await response.json()) as Array<{ id: string; name: string }> };
	});

	<section>
		${outside}
		@try {
			<>
				<ul ${listAttributes}>
					@for (const item of found.items; key item.id) {
						<li>{item.name}</li>
					}
				</ul>
				${extra}
			</>
		} @pending {
			<p aria-busy="true">Searching...</p>
		}
	</section>
}
`;

test('an expression aria-busy on an element a refresh marks busy is an error', () => {
	const source = results('aria-busy={found.q !== query}');
	const [error, ...rest] = errors(source);
	expect(rest).toEqual([]);
	expect(error).toMatchObject({ severity: 'error', code: CODE });
	expect(spanText(source, error?.primarySpan)).toBe('aria-busy={found.q !== query}');
	expect(error?.message).toBe(
		'aria-busy on this element is managed by the async boundary; dim stale content with a class or a data- attribute instead.',
	);
	expect(error?.docsUrl).toBe(`https://markless.dev/errors/${CODE}`);
});

test('a static aria-busy on an element whose text reads the async value is an error', () => {
	const source = results('', '<p aria-busy="false">{found.q}</p>');
	const [error, ...rest] = errors(source);
	expect(rest).toEqual([]);
	expect(spanText(source, error?.primarySpan)).toBe('aria-busy="false"');
});

test('aria-busy on elements the runtime does not mark stays quiet', () => {
	expect(
		errors(
			results(
				'data-stale={found.q !== query}',
				'<button aria-busy={saving}>Save</button>',
				'<form aria-busy={saving}></form>',
			),
		),
	).toEqual([]);
});
