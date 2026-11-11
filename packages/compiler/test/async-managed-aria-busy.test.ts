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

const form = (formAttributes: string, controls: string, around = '') => `import { state } from '@markless/core';

export function Note() @{
	let saving = state(false);
	let sent = state(0);

	<section ${around}>
		<form ${formAttributes}>
			<input name="title" />
			${controls}
		</form>
	</section>
}
`;

const asyncSubmit = 'onSubmit={async (event) => { event.preventDefault(); await fetch("/save", { method: "POST" }); }}';

test('aria-busy on a form whose submit handler can return a promise is an error', () => {
	const source = form(`aria-busy={saving} ${asyncSubmit}`, '<button>Save</button>');
	const [error, ...rest] = errors(source);
	expect(rest).toEqual([]);
	expect(error).toMatchObject({ severity: 'error', code: CODE });
	expect(spanText(source, error?.primarySpan)).toBe('aria-busy={saving}');
	expect(error?.message).toBe(
		'aria-busy on this form is managed while its submit handler runs; style the busy form with form[aria-busy="true"] instead.',
	);
	expect(error?.docsUrl).toBe(`https://markless.dev/errors/${CODE}`);
});

test('a static aria-busy on such a form, or a submit handler on an element around it, is an error too', () => {
	expect(errors(form(`aria-busy="false" ${asyncSubmit}`, '<button>Save</button>'))).toHaveLength(1);
	expect(errors(form('aria-busy={saving}', '<button>Save</button>', asyncSubmit))).toHaveLength(1);
});

test('aria-disabled on the control that submits such a form is an error', () => {
	for (const control of [
		'<button aria-disabled={saving}>Save</button>',
		'<button type="submit" aria-disabled="false">Save</button>',
		'<input type="submit" aria-disabled={saving} />',
		'<input type="image" alt="Save" aria-disabled={saving} />',
	]) {
		const source = form(asyncSubmit, control);
		const [error, ...rest] = errors(source);
		expect(rest).toEqual([]);
		expect(spanText(source, error?.primarySpan)).toMatch(/^aria-disabled=/);
		expect(error?.message).toBe(
			'aria-disabled on this submit control is managed while its form submits; style it with [aria-disabled="true"] or mark your own state with a class or a data- attribute instead.',
		);
	}
});

test('forms and controls the submit hold never marks stay quiet', () => {
	const sync = 'onSubmit={(event) => { event.preventDefault(); sent++; }}';
	for (const source of [
		form(`aria-busy={saving} ${sync}`, '<button aria-disabled={saving}>Save</button>'),
		form('aria-busy={saving}', '<button aria-disabled={saving}>Save</button>'),
		form(asyncSubmit, '<button type="button" aria-disabled={saving}>Preview</button>'),
		form(asyncSubmit, '<button type="reset" aria-disabled={saving}>Clear</button>'),
		form(asyncSubmit, '<button form="other" aria-disabled={saving}>Elsewhere</button>'),
		form(asyncSubmit, '<input aria-disabled={saving} /><fieldset aria-busy={saving}></fieldset>'),
	])
		expect(errors(source)).toEqual([]);
});
