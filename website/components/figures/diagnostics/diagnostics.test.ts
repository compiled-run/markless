import { readFileSync } from 'node:fs';
import { collectTsrxModuleDiagnostics, compileTsrxModule } from '../../../../packages/compiler/src/index.ts';
import { describe, expect, it } from 'vitest';
import { ALLOW, ERROR, FOR, WARN } from './overlay.ts';

const page = readFileSync(new URL('../../../pages/tooling/diagnostics.mdx', import.meta.url), 'utf8');
const toy = readFileSync(new URL('./overlay-figure.tsrx', import.meta.url), 'utf8');
const overlay = readFileSync(new URL('../../../../packages/bundler/src/dev-error/index.ts', import.meta.url), 'utf8');

const list = (header: string, comment = '') => `import { state } from '@markless/core';

export default function List() @{
	let items = state(['Milk', 'Eggs']);

	<section>
		<ul>
${comment ? '\t\t\t' + comment + '\n' : ''}			${header}
				<li>{item}</li>
			}
		</ul>
	</section>
}
`;

async function diagnose(source: string) {
	const compiled = await compileTsrxModule({ filename: '/app/pages/list.tsrx', moduleId: '/app/pages/list.tsrx', source, buildId: 'figure', resolverId: 'figure', symbols: [] } as never);
	return collectTsrxModuleDiagnostics(compiled).map((d) => ({ code: d.code, message: d.message, why: d.why, fix: d.suggestions?.[0]?.message, docs: d.docsUrl, suppressed: (d as { suppressed?: boolean }).suppressed === true }));
}

describe('diagnostics overlay figure', () => {
	it('shows the error the compiler emits for the list with no key', async () => {
		const [error] = await diagnose(list(FOR.none));
		expect(error).toEqual({ code: ERROR.code, message: ERROR.message, why: ERROR.why, fix: ERROR.fix, docs: ERROR.docs, suppressed: false });
		expect(page).toContain(FOR.keyed);
	});

	it('builds clean with the key, and warns with an index key', async () => {
		expect(await diagnose(list(FOR.keyed))).toEqual([]);
		const warnings = await diagnose(list(FOR.index));
		expect(warnings.map((d) => d.code)).toEqual([WARN.index.code]);
		expect(warnings[0]!.message.startsWith(WARN.index.message)).toBe(true);
	});

	it('silences the warning only when markless-allow gives a reason', async () => {
		expect((await diagnose(list(FOR.index, ALLOW.reason))).every((d) => d.suppressed)).toBe(true);
		const bare = await diagnose(list(FOR.index, ALLOW.bare));
		expect(bare.find((d) => d.code === WARN.reason.code)?.message).toBe(WARN.reason.message);
		expect(bare.some((d) => d.code === WARN.index.code && !d.suppressed)).toBe(true);
	});

	it('lays the overlay out as the dev server does', () => {
		for (const part of ['<h2>Why</h2>', '<h2>Suggested fix</h2>', 'class="frame"', 'documentation</a>']) expect(overlay).toContain(part);
	});

	it('answers press and keys, speaks each change, and drops animation under reduced motion', () => {
		for (const hook of ["setKey('keyed')", 'onClick={() => cycleAllow()}', "event.key === 'Escape'", 'aria-live="polite"', 'prefers-reduced-motion: reduce']) expect(toy).toContain(hook);
	});
});
