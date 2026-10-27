import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { build } from 'vite';
import { expect, test, vi } from 'vitest';
import { rewriteTemplateDynamicImports } from '../src/template-dynamic-imports.ts';
import { markless } from '../src/vite/index.ts';

// A whole production build: 2.3 s alone at load average 54, past 5 s in the pre-commit unit lane.
vi.setConfig({ testTimeout: 30_000 });

test('a template import() in a virtual module becomes a root-relative glob of the authoring directory', () => {
	const code =
		'export const s0 = async (side) => (await import(`./panels/${side}-panel.ts`)).label;';
	const next = rewriteTemplateDynamicImports(code, '/app/src/pages/home.tsrx', '/app');

	expect(next).toContain(
		'__marklessTemplateImport(import.meta.glob("/src/pages/panels/*-panel.ts"), `/src/pages/panels/${side}-panel.ts`)',
	);
	expect(
		rewriteTemplateDynamicImports(
			code.replace('./panels/', '../panels/'),
			'/app/src/pages/home.tsrx',
			'/app',
		),
	).toContain('import.meta.glob("/src/panels/*-panel.ts")');
});

test('static, bare and already-globbed imports are left alone', () => {
	for (const code of [
		"const a = () => import('./panel.ts');",
		'const b = (x) => import(`pkg/${x}.js`);',
		'const c = () => import(`./panel.ts`);',
	])
		expect(rewriteTemplateDynamicImports(code, '/app/src/home.tsrx', '/app')).toBe(code);
});

test('a production build emits each module a handler template import() can reach', async () => {
	const root = await mkdtemp(join(tmpdir(), 'markless-template-import-'));
	try {
		await mkdir(join(root, 'src/panels'), { recursive: true });
		await symlink(
			resolve(import.meta.dirname, '../fixtures/vite-csr/node_modules'),
			join(root, 'node_modules'),
		);
		await writeFile(
			join(root, 'index.html'),
			'<div id="app"></div><script type="module" src="/src/main.ts"></script>',
		);
		await writeFile(
			join(root, 'src/main.ts'),
			"import { render } from '@markless/core';\nimport { Page } from './page.tsrx';\nawait render(Page, { target: document.querySelector('#app')! });\n",
		);
		await writeFile(
			join(root, 'src/panels/north-panel.ts'),
			"export const label = 'north panel';\n",
		);
		await writeFile(
			join(root, 'src/panels/south-panel.ts'),
			"export const label = 'south panel';\n",
		);
		await writeFile(
			join(root, 'src/page.tsrx'),
			`import { state } from '@markless/core';
export function Page() @{
	let side = state('north');
	let label = state('none');
	<div>
		<output>{label}</output>
		<button onClick={() => { side = 'south'; }}>south</button>
		<button onClick={async () => { const panel = await import(\`./panels/\${side}-panel.ts\`); label = panel.label; }}>load</button>
	</div>
}
`,
		);
		const output = await build({
			configFile: false,
			root,
			logLevel: 'silent',
			build: { write: false },
			plugins: [markless()],
		});
		const chunks = (Array.isArray(output) ? output : [output])
			.flatMap((item) => ('output' in item ? item.output : []))
			.filter((item) => item.type === 'chunk');
		const code = chunks.map((chunk) => chunk.code).join('\n');

		expect(code).toContain('north panel');
		expect(code).toContain('south panel');
		expect(code).toMatch(/"\/src\/panels\/north-panel\.ts":\(\)=>/);
		expect(code).toMatch(/"\/src\/panels\/south-panel\.ts":\(\)=>/);
		expect(code).toContain('`/src/panels/${');
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
