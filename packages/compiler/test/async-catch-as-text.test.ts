import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

const CODE = 'MARKLESS_ASYNC_CATCH_WITHOUT_TRY';

async function codes(body: string) {
	const result = await compileTsrxModule({
		filename: 'src/Panel.tsrx',
		source: `import { computed } from '@markless/core';

export function Panel() @{
	const report = computed(async () => {
		await null;
		return { title: 'x' };
	});

	${body}
}`,
		symbols: [],
	});
	return result.semanticGraph.diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.severity]);
}

test('an @catch written after an element instead of an @try refuses', async () => {
	for (const body of [
		'<section><h2>{report.title}</h2> @catch (error) { <p>{error.message}</p> }</section>',
		'<ul>\n\t\t<li>one</li>\n\t\t@catch (failure, retry) {\n\t\t\t<em>Broken</em>\n\t\t}\n\t</ul>',
		'<article><span>a</span> @catch { <b>Failed</b> }</article>',
	])
		expect(await codes(body), body).toContainEqual([CODE, 'error']);
});

test('an @catch after an @try block, and prose naming @catch, compile clean', async () => {
	for (const body of [
		'<section>@try { <h2>{report.title}</h2> } @catch (error) { <p>{error.message}</p> }</section>',
		'<p>Write @catch (error) after a block to handle it.</p>',
		'<code>@catch (error)</code>',
	])
		expect(await codes(body), body).not.toContainEqual([CODE, 'error']);
});
