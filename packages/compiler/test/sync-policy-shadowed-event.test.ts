import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// A nested function, block or catch that declares the handler's event name again holds its own value there; a cancel on it is refused, never moved into the event's policy.
const SHADOWS = [
	'[{ preventDefault: () => (ticks = 7) }].forEach((NAME) => NAME.preventDefault());',
	'[{ preventDefault: () => (ticks = 7) }].forEach(function (item) { const NAME = item; NAME.preventDefault(); });',
	'{ const NAME = { preventDefault: () => (ticks = 7) }; NAME.preventDefault(); }',
	'try { throw { preventDefault: () => (ticks = 7) }; } catch (NAME) { NAME.preventDefault(); }',
];

function compileHandler(parameter: string, body: string) {
	return compileTsrxModule({
		filename: 'src/dial.tsrx',
		source: `import { state } from '@markless/core';
export function Dial() @{
	let ticks = state(0);
	let open = state(true);
	<button onClick={(${parameter}) => { ${body} }}>{ticks}</button>
}
`,
		symbols: [],
	});
}

for (const name of ['e', 'event']) {
	for (const shadow of SHADOWS) {
		const inner = shadow.replaceAll('NAME', name);
		for (const body of [`if (open) { ${inner} }`, `${name}.preventDefault(); if (open) { ${inner} }`]) {
			test(`a cancel on a nested ${name} fails the build instead of cancelling the event: ${body.slice(0, 60)}`, async () => {
				const result = await compileHandler(name, body);
				const errors = result.semanticGraph.diagnostics.filter((item) => item.severity === 'error');
				expect(errors).toEqual([
					expect.objectContaining({
						code: 'MARKLESS_SYNC_POLICY_SECOND_CANCEL',
						message: expect.stringContaining(`\`${name}\` that a nested function, block or catch declares again`),
					}),
				]);
			});
		}
	}
}

for (const handler of [
	'(e) => { ticks = 1; e.preventDefault() }',
	'(e) => { e.stopPropagation(); e.preventDefault(); ticks = 1; }',
	'(event) => { event.preventDefault(); return ticks = 1; }',
]) {
	test(`a write beside the parameter's own cancels is still a scalar leaf: ${handler}`, async () => {
		const result = await compileTsrxModule({
			filename: 'src/dial.tsrx',
			source: `import { state } from '@markless/core';
export function Dial() @{
	let ticks = state(0);
	<a href="#x" onClick={${handler}}>{ticks}</a>
}
`,
			symbols: [],
		});
		expect(result.semanticGraph.diagnostics).toEqual([]);
		const module = result.symbolModules.modules.find((item) => item.kind === 'event-handler')!;
		expect(module.source).toContain('marklessWriteScalar');
	});
}
