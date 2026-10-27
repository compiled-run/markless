import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { codePane } from '../../../tooling/code-blocks.ts';

const counter = readFileSync(new URL('../../demos/start/counter.tsrx', import.meta.url), 'utf8');

const BROWSER = `import { render } from '@markless/core';
import Counter from './counter.tsrx';

const target = document.querySelector('#app');
if (!target) throw new Error('Missing #app');

await render(Counter, { target });
`;

const SERVER = `import { renderToString } from '@markless/core';
import Counter from './counter.tsrx';

const html = await renderToString(Counter);
`;

const TEST = `import { render } from '@markless/vitest-browser';
import { expect, test } from 'vitest';
import Counter from './counter.tsrx';

test('a click counts', async () => {
	const screen = await render(Counter);
	const button = screen.container.querySelector('button')!;
	button.click();
	await expect.poll(() => button.textContent).toBe('Count 1');
});
`;

const INDEX_HTML = `<!doctype html>
<html lang="en">
	<body>
		<div id="app"></div>
		<script type="module" src="/src/main.ts"></script>
	</body>
</html>
`;

const MAIN = `import { render } from '@markless/core';
import App from './App.tsrx';

const target = document.querySelector('#app');
if (!target) throw new Error('Missing #app');

await render(App, { target });
`;

const SOURCES = {
	hostBrowser: [
		{ name: 'main.ts', code: BROWSER },
		{ name: 'counter.tsrx', code: counter },
	],
	hostServer: [
		{ name: 'server.ts', code: SERVER },
		{ name: 'counter.tsrx', code: counter },
	],
	hostTest: [
		{ name: 'counter.browser.ts', code: TEST },
		{ name: 'counter.tsrx', code: counter },
	],
	browserOnly: [
		{ name: 'index.html', code: INDEX_HTML },
		{ name: 'src/main.ts', code: MAIN },
		{ name: 'src/App.tsrx', code: counter.replace('function Counter', 'function App') },
	],
};

describe('start and home preview code bands', () => {
	it('show the files the previews describe, highlighted (run with -u after editing)', async () => {
		const blocks: string[] = [];
		for (const [name, files] of Object.entries(SOURCES)) {
			const panes = await Promise.all(files.map((file, index) => codePane(file, index)));
			blocks.push(`export const ${name}: readonly PreviewFile[] = ${JSON.stringify(panes)};`);
		}
		const module = `// Written by code-panes.test.ts. Run \`vp test -u\` to refresh.
import type { PreviewFile } from '../../docs/preview-card.tsrx';

${blocks.join('\n\n')}
`;
		await expect(module).toMatchFileSnapshot('./code-panes.ts');
	}, 30_000);
});
