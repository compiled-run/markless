import { expect, test } from 'vitest';
import { compileNativeComponent } from '../src/index.ts';

const source = `import { lucide } from '@markless/ui';
export default function App() @{
	<main>
		<button><lucide.heart title="Like" /></button>
	</main>
}`;

test("an icon tag is the inline <svg> ui() gives the web build, unless the app turns ui()'s icons off", async () => {
	const built = await compileNativeComponent({ filename: 'src/App.tsrx', source });
	expect(built.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
	expect(built.payload?.nodes[2]).toMatchObject({ kind: 'element', element: 'svg', parent: 'h1', attributes: expect.objectContaining({ 'aria-label': 'Like' }) });

	const off = await compileNativeComponent({ filename: 'src/App.tsrx', source, icons: false });
	expect(off.payload).toBeNull();
	expect(off.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
		'<lucide.heart>, a component from another module',
	);
});
