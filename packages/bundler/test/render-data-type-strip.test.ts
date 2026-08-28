import { transformSync } from 'rolldown/experimental';
import { expect, test } from 'vitest';
import {
	stripEmittedTypes,
	stripEmittedTypesFromFragment,
	transformTsrxModule,
} from '../src/transform.ts';

// The render-data virtual module is generated JSON with three authored slices
// spliced in: the residue reader, its module-scope declarations, and its
// imports. Authored TypeScript reaches only those three, and only they are
// stripped — reprinting the whole emission grows the JSON blob and rewrites the
// CSS entries beside it.

const TYPED_MODULE_SOURCE = `
import { state } from '@markless/core';

const TONES = { calm: 'Calm', loud: 'Loud' } as const;
const FALLBACK_TONE: string = 'Calm';

export default function TypedTonePage() @{
	const view = state({ tone: 'calm' });

	<main data-label={TONES[view.tone] ?? FALLBACK_TONE}>{view.tone}</main>
}
`;

const HANDLER_ONLY_SOURCE = `
import { state } from '@markless/core';

const STEP: number = 2;

export default function HandlerOnlyPage() @{
	let count = state(0);

	<button onClick={() => (count += STEP)}>{count}</button>
}
`;

const UNTYPED_MODULE_SOURCE = `
import { state } from '@markless/core';

const TONES = { calm: 'Calm', loud: 'Loud' };

export default function UntypedTonePage() @{
	const view = state({ tone: 'calm' });

	<main data-label={TONES[view.tone]}>{view.tone}</main>
}
`;

// Three shapes a JavaScript parse accepts or the printer would otherwise wave
// through: a generic call reads as two comparisons, an `as` cast and a non-null
// `!` sit inside a declaration the reader lifts whole.
const AMBIGUOUS_MODULE_SOURCE = `
import { state } from '@markless/core';

type Limit = number;
const WIDTH = 4;
function pick<T>(value: T): T { return value; }
const CAP = pick<Limit>(WIDTH);
const LOUD = (WIDTH as Limit) + 1;
const BOX: { n?: number } = { n: 3 };
const FORCED = BOX.n!;

export default function AmbiguousTonePage() @{
	const view = state({ tone: 'calm' });

	<main data-label={\`\${CAP}-\${LOUD}-\${FORCED}-\${view.tone}\`}>{view.tone}</main>
}
`;

const STYLED_SOURCE = `
import { state } from '@markless/core';

export default function StyledPage() @{
	let label = state('Hi');

	<section class="card">
		<style>
			.card { color: red; }
		</style>
		<p>{label}</p>
	</section>
}
`;

async function renderDataSource(name: string, source: string): Promise<string> {
	const modules = await virtualModules(name, source);
	const renderData = modules.find((module) => module.type === 'render-data');
	if (!renderData) throw new Error(`No render-data module for ${name}.`);
	return renderData.source;
}

async function virtualModules(name: string, source: string) {
	const result = await transformTsrxModule({
		filename: `/workspace/app/src/${name}.tsrx`,
		source,
		environment: 'client',
	});
	return result.virtualModules;
}

function javaScriptParseErrors(code: string): string[] {
	const out = transformSync('render-data-probe.js', code);
	return (out.errors ?? []).map((error) => error.message);
}

test('authored TypeScript at module scope leaves the render-data module parsable as JavaScript', async () => {
	const source = await renderDataSource('typedTone', TYPED_MODULE_SOURCE);

	expect(source).toContain('TONES');
	expect(source).not.toContain('as const');
	expect(source).not.toContain('FALLBACK_TONE: string');
	expect(javaScriptParseErrors(source)).toEqual([]);
});

test('a handler-only module carries no residue reader, so no module-scope type can leak', async () => {
	const source = await renderDataSource('handlerOnly', HANDLER_ONLY_SOURCE);

	expect(source).not.toContain('readResidue');
	expect(source).not.toContain('STEP');
	expect(javaScriptParseErrors(source)).toEqual([]);
});

test('a residue reader with no TypeScript keeps the exact bytes the compiler emitted', async () => {
	const source = await renderDataSource('untypedTone', UNTYPED_MODULE_SOURCE);

	// The compiler emits the reader without spaces; oxc's printer would add them.
	expect(source).toContain('readResidue:(residue,marklessResidueContext)=>{');
	expect(source).toContain('const TONES = { calm: \'Calm\', loud: \'Loud\' };');
	expect(javaScriptParseErrors(source)).toEqual([]);
});

test('every virtual module a TypeScript-free source emits stays byte-identical', async () => {
	const modules = await virtualModules('untypedTone', UNTYPED_MODULE_SOURCE);

	expect(
		modules.map((module) => `--- ${module.type} ---\n${module.source}`).join('\n'),
	).toMatchSnapshot('virtual modules for a source that carries no TypeScript');
});

test('a style entry reaches its virtual module as CSS, never through the type stripper', async () => {
	const modules = await virtualModules('styledPage', STYLED_SOURCE);
	const style = modules.find((module) => module.type === 'style');

	expect(style?.source).toMatch(/\.card\.mk-[a-z0-9]+ \{ color: red; \}/);
	// The stripper is fail-closed, so CSS reaching it would be loud, not silent.
	await expect(stripEmittedTypes(style!.source, 'style-probe')).rejects.toThrow(
		'MARKLESS_TYPE_STRIP_FAILED',
	);
});

test('a fragment the stripper cannot parse fails loudly and names the module', async () => {
	await expect(
		stripEmittedTypes('const = ;', 'virtual:markless:render-data:probe'),
	).rejects.toThrow(/MARKLESS_TYPE_STRIP_FAILED: virtual:markless:render-data:probe/);
});

// A generic call is TypeScript that is also valid JavaScript with a different
// meaning: `pick<Limit>(WIDTH)` reads as `(pick < Limit) > (WIDTH)`. Deciding by
// a JavaScript parse shipped it verbatim, so the browser evaluated comparisons.
test('a generic call in a reader declaration is stripped, not shipped as two comparisons', async () => {
	const source = await renderDataSource('ambiguousTone', AMBIGUOUS_MODULE_SOURCE);

	expect(source).toContain('const CAP = pick(WIDTH);');
	expect(source).not.toContain('pick<Limit>');
	expect(javaScriptParseErrors(source)).toEqual([]);
});

test('an `as` assertion and a non-null `!` in reader declarations are stripped', async () => {
	const source = await renderDataSource('ambiguousTone', AMBIGUOUS_MODULE_SOURCE);

	expect(source).toContain('const LOUD = WIDTH + 1;');
	expect(source).toContain('const FORCED = BOX.n;');
	expect(source).not.toContain('as Limit');
	expect(source).not.toContain('BOX.n!');
});

test('the fragment stripper reads each shape as TypeScript, not as JavaScript', async () => {
	const at = 'virtual:markless:render-data:probe';

	expect(await stripEmittedTypesFromFragment('const CAP = pick<Limit>(WIDTH);', at)).toBe(
		'const CAP = pick(WIDTH);',
	);
	expect(await stripEmittedTypesFromFragment('const LOUD = (WIDTH as Limit) + 1;', at)).toBe(
		'const LOUD = WIDTH + 1;',
	);
	expect(await stripEmittedTypesFromFragment('const FORCED = BOX.n!;', at)).toBe(
		'const FORCED = BOX.n;',
	);
});

test('a fragment with no TypeScript comes back byte-identical, spacing and all', async () => {
	const at = 'virtual:markless:render-data:probe';
	const untouched = [
		"const TONES = { calm: 'Calm', loud: 'Loud' };",
		'const  spaced   =  1 ;',
		'import { pick } from "./pick.js";',
		'function pick(value) {\n    return value;\n}',
	];

	for (const fragment of untouched) {
		expect(await stripEmittedTypesFromFragment(fragment, at)).toBe(fragment);
	}
	expect(await stripEmittedTypesFromFragment('import { pick } from "./pick.js";', at, true)).toBe(
		'import { pick } from "./pick.js";',
	);
});
