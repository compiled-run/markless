import { expect, test } from 'vitest';
import { injectCsrNativeMarkup } from '../src/build/csr-native-markup.ts';
import { transformTsrxModule } from '../src/transform.ts';

test('standard CSR statics leave executable JS and arrive as native templates plus inert data', async () => {
	const transformed = await transformTsrxModule({
		filename: '/workspace/app/src/App.tsrx',
		source: `function Card({ title }) @{ <article><h2>{title}</h2></article> }
export function App() @{ <main><Card title="Native" /></main> }`,
		environment: 'client',
	});

	expect(transformed.code).not.toContain('MARKLESS_CSR_NATIVE_START');
	expect(transformed.code).not.toContain('<article>');
	expect(transformed.code).not.toContain('state as payloadState');
	expect(transformed.code).not.toContain('view as payloadView');
	expect(transformed.manifest.csrNativeMarkup?.length).toBeGreaterThan(0);

	const html = {
		type: 'asset' as const,
		fileName: 'index.html',
		source: '<html><body><div id="app"></div></body></html>',
	};
	injectCsrNativeMarkup({ 'index.html': html }, [transformed.manifest]);

	expect(html.source).toContain('<template id="markless-csr-data:');
	expect(html.source).toContain('<article><h2><!--markless-slot:0--></h2></article>');
	expect(html.source).toContain('<script type="application/json" id="markless-csr-data:');
	expect(html.source.indexOf('<template')).toBeLessThan(html.source.indexOf('</body>'));
});
