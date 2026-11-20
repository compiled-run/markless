import { expect, it } from 'vitest';
import { compileNativeComponent, createNativeRuntime } from '../src/index.ts';

const chosen = async (markup: string) => {
	const build = await compileNativeComponent({
		filename: 'src/Order.tsrx',
		source: `import { state } from '@markless/core';
export default function Order() @{
	const crusts = state(['thick', 'thin', 'stuffed']);
	<main>${markup}</main>
}
`,
	});
	expect(build.diagnostics).toEqual([]);
	const runtime = createNativeRuntime(build.payload!);
	const texts = runtime.texts();
	return runtime
		.selections()
		.filter(([, selected]) => selected)
		.map(([node]) => {
			const [host, row] = node.split('@');
			const textNode = `${host}:text0${row === undefined ? '' : `@${row}`}`;
			return texts.find(([id]) => id === textNode)?.[1].trim();
		});
};

it('a phone shows the option a literal <select value> names, as the web does', async () => {
	expect(
		await chosen('<select value="b"><option value="a">A</option><option value="b">B</option></select>'),
	).toEqual(['B']);
	expect(await chosen('<select value="Large"><option>Small</option><option> Large </option></select>')).toEqual([
		'Large',
	]);
});

it('a phone shows the row option a literal <select value> names, compared as text', async () => {
	expect(
		await chosen(
			'<select value="thin">@for (const crust of crusts; key crust) {<option value={crust}>{crust}</option>}</select>',
		),
	).toEqual(['thin']);
});
