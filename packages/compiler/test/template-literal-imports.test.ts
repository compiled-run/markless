/**
 * An imported identifier used only inside a template literal interpolation has
 * to reach the emitted symbol module, and a name that only appears in the
 * literal's *text* still has to stay invisible.
 *
 * `referencedModuleImports` in `passes/symbol-resolver.ts` decides which module
 * imports an emitted symbol carries by searching the symbol's source text after
 * blanking strings and comments. Blanking a whole template literal — backtick to
 * backtick — hides the `${...}` expressions too, so
 * `computed(() => ` + '`0 0 ${qrSize(value)}`' + `)` shipped a module with no
 * import of `qrSize` and died at render with `ReferenceError: qrSize is not
 * defined` (sighted in `packages/headless/components/src/qr-code/note.md`).
 *
 * The rows below run the real resolver over authored modules: interpolation
 * names are collected, text names are not, and both hold through nested
 * templates, escaped backticks, and an escaped `\${` that is text rather than an
 * interpolation.
 */
import { expect, test } from 'vitest';
import { buildSemanticGraph, lowerStateAccess, planPayloadArena } from '../src/index.ts';
import { planSymbolResolver } from '../src/passes/symbol-resolver.ts';

/** Local names of the module imports the named computed's symbol carries. */
async function computedImports(
	filename: string,
	source: string,
	computedName: string,
): Promise<ReadonlyArray<string>> {
	const semanticGraph = await buildSemanticGraph({ filename, source });
	expect(semanticGraph.diagnostics).toEqual([]);

	const stateLowering = lowerStateAccess({ semanticGraph });
	const payloadArena = planPayloadArena({ semanticGraph, stateLowering });
	const plan = planSymbolResolver({ semanticGraph, payloadArena, stateLowering });

	const symbol = plan.symbols.find(
		(candidate) =>
			(candidate.kind === 'sync-computed-derive' ||
				candidate.kind === 'async-computed-runner') &&
			candidate.name === computedName,
	);
	expect(symbol, `no computed symbol named ${computedName}`).toBeDefined();

	return (symbol?.moduleImports ?? []).map((item) => item.localName);
}

test('an import used only inside an interpolation reaches the computed symbol', async () => {
	const imports = await computedImports(
		'src/QrCode.tsrx',
		`
import { computed, state } from '@markless/core';
import { qrSize } from './qr-encode';

export function QrCode() @{
	const value = state('hi');
	const viewBox = computed(() => \`0 0 \${qrSize(value)}\`);

	<svg viewBox={viewBox}></svg>
}
`,
		'viewBox',
	);

	expect(imports).toEqual(['qrSize']);
});

test('an import that only appears in the literal text is still not collected', async () => {
	const imports = await computedImports(
		'src/QrCodeText.tsrx',
		`
import { computed, state } from '@markless/core';
import { qrSize, moduleCount } from './qr-encode';

export function QrCodeText() @{
	const value = state('hi');
	const viewBox = computed(() => \`moduleCount of 0 0 \${qrSize(value)}\`);

	<svg viewBox={viewBox}></svg>
}
`,
		'viewBox',
	);

	expect(imports).toEqual(['qrSize']);
});

test('a nested template keeps its inner interpolation and blanks its inner text', async () => {
	const imports = await computedImports(
		'src/QrCodeNested.tsrx',
		`
import { computed, state } from '@markless/core';
import { formatCell, innerOnly } from './qr-encode';

export function QrCodeNested() @{
	const value = state('hi');
	const label = computed(() => \`a\${\`b innerOnly \${formatCell(value)} c\`}d\`);

	<p>{label}</p>
}
`,
		'label',
	);

	expect(imports).toEqual(['formatCell']);
});

test('an escaped backtick does not end the literal, and an escaped dollar is text', async () => {
	const imports = await computedImports(
		'src/QrCodeEscapes.tsrx',
		`
import { computed, state } from '@markless/core';
import { wrap, escapedOnly, notInterpolated } from './qr-encode';

export function QrCodeEscapes() @{
	const value = state('hi');
	const quoted = computed(
		() => \`\\\`escapedOnly\\\` \${wrap(value)} \\\${notInterpolated}\`,
	);

	<p>{quoted}</p>
}
`,
		'quoted',
	);

	expect(imports).toEqual(['wrap']);
});

test('a plain string inside an interpolation still hides the names in it', async () => {
	const imports = await computedImports(
		'src/QrCodeStringInside.tsrx',
		`
import { computed, state } from '@markless/core';
import { pick, quotedOnly } from './qr-encode';

export function QrCodeStringInside() @{
	const value = state('hi');
	const label = computed(() => \`x \${pick(value, 'quotedOnly')} y\`);

	<p>{label}</p>
}
`,
		'label',
	);

	expect(imports).toEqual(['pick']);
});
