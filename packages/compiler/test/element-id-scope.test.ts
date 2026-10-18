import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';
import { elementHandleIdReadCase } from '../src/passes/public-render/residue-reader.ts';

// Two roots rendered separately onto one page (an MDX route's islands, or two
// client render() mounts) compose from the same component paths, so the render
// root's scope has to lead every minted element() id, on the server and in the
// browser alike.

function reader(idPrefixSource: string, idScopeSource: string) {
	return new Function(
		'marklessResidue',
		'marklessSsrIdPrefix',
		'marklessSsrRenderContext',
		'context',
		elementHandleIdReadCase({ idPrefixSource, idScopeSource, widgetInstanceRead: null }),
	) as (residue: unknown, prefix: string, renderContext: unknown, context: unknown) => string;
}

const residue = { kind: 'element-handle-id', handleGraphNodeId: 'element:note' };

test('the server and browser mints spell one id from the same scope and prefix', () => {
	const served = reader('marklessSsrIdPrefix', "(marklessSsrRenderContext?.elementIdScope??'')");
	const browser = reader("(context.idPrefix??'')", "(context.elementIdScope??'')");
	expect(served(residue, 'c0:', { elementIdScope: 'm1:' }, undefined)).toBe(
		'mx-m1-c0-element-note',
	);
	expect(browser(residue, '', '', { idPrefix: 'c0:', elementIdScope: 'm1:' })).toBe(
		'mx-m1-c0-element-note',
	);
	expect(served(residue, 'c0:', undefined, undefined)).toBe('mx-c0-element-note');
});

test('the emitted server module reads its scope from the render context', async () => {
	const compiled = await compileTsrxModule({
		filename: 'src/card.tsrx',
		source: `import { element } from '@markless/core';
export default function Card() @{
	const box = element<HTMLInputElement>();
	<div><input el={box} /><label for={box}>Box</label></div>
}`,
		buildId: 'build',
		resolverId: 'resolver',
		symbols: [],
	});
	const source = compiled.publicRenderModule.ssrModuleSource ?? '';
	expect(source).toContain(
		"'mx-'+((marklessSsrRenderContext?.elementIdScope??'')+marklessSsrIdPrefix+",
	);
});
