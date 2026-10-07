import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// `{children}` inside an arm is markup the caller projected, so a flip that
// rebuilds the arm writes it as HTML when it is the served projection itself, and
// escapes anything else, such as text the caller routes in.

test('a rebuilt arm writes projected children as HTML and other reads as text', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Mark.tsrx',
		source: `
import { state } from '@markless/core';

export function Mark({ children, label }) @{
	let shown = state(false);
	<span onClick={() => (shown = !shown)}>
		@if (shown) { <>{children}</> } @else { <em>{label}</em> }
	</span>
}`,
		symbols: [],
	});
	expect(result.symbolModules.diagnostics).toEqual([]);
	const module =
		result.symbolModules.modules.find((candidate) => candidate.kind === 'branch-update')
			?.source ?? '';
	expect(module).toContain(
		'import { marklessProjectionHtml } from "@markless/web/fns/projection-html";',
	);
	expect(module).toMatch(/"read": \{[^}]*"children"[^}]*\}, "raw": \["children"\] \}/);
	expect(module).toMatch(
		/part\.raw \? marklessProjectionHtml\(context\.graph\.read\(part\.read\.graphNodeId, part\.read\.path\), context\.graph\.read\("prop:props", \[\]\), part\.raw, marklessBranchText\)/,
	);
	expect(module).not.toMatch(/"label"[^}]*\}, "raw"/);
});
