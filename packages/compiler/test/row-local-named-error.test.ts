import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// Every SSR data callback declares the row locals and the `@catch` arm's `error` in one
// scope, so a row variable named `error` used to be declared twice and the module failed to parse.
async function ssrSource(rowName: string) {
	const compiled = await compileTsrxModule({
		filename: 'src/page.tsrx',
		source: `import { state } from '@markless/core';
export default function Page() @{
	let problems = state(['too short', 'missing digit']);
	<ul>
		@for (const ${rowName} of problems; key ${rowName}) {
			<li>{${rowName}}</li>
		}
	</ul>
}
`,
		symbols: [],
	});
	return compiled.publicRenderModule.ssrModuleSource ?? '';
}

const errorLocal = /const error\s*=\s*marklessSsrDataContext\.asyncError;/;

test('a row variable named error is the only `error` the SSR callbacks declare', async () => {
	const source = await ssrSource('error');
	expect(source).not.toMatch(errorLocal);
	expect(source).toMatch(/const error\s*=/);
});

test('a row variable with another name leaves the `@catch` error local in place', async () => {
	expect(await ssrSource('problem')).toMatch(errorLocal);
});
