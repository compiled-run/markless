import { expect, it } from 'vitest';
import { compileNativeComponent, pageScrollDiagnostics } from '../src/index.ts';

const source = `import { state } from '@markless/core';

export default function App() @{
	let note = state('');
	<main class="page">
		<style>
			.page { padding: 16px; }
		</style>
		<p>Settings</p>
		<input aria-label="Volume" value={note} onInput={(event) => (note = event.currentTarget.value)} />
	</main>
}
`;

it('a page whose scroll range Dragon leaves undecided is a build error naming the file and the element where it is written', async () => {
	const build = await compileNativeComponent({ filename: 'src/App.tsrx', source });
	expect(build.diagnostics).toEqual([]);
	const input = build.payload!.nodes.find(
		(node) => node.kind === 'element' && node.element === 'input',
	)!;
	const undecided = {
		nodeId: input.id,
		detail: 'a range form control: its scrollable overflow is not decided here',
	};
	const exported = {
		targets: {
			ios: { assignments: [{ pageScroll: null, pageScrollUndecided: undecided }] },
			android: { assignments: [{ pageScroll: null, pageScrollUndecided: undecided }] },
		},
	};
	const [error, ...rest] = pageScrollDiagnostics(exported, build, 'src/App.tsrx');
	expect(rest).toEqual([]);
	expect(error).toMatchObject({ code: 'MARKLESS_NATIVE_UNSUPPORTED', severity: 'error' });
	expect(error!.message).toBe(
		`src/App.tsrx: the page's scroll range cannot be decided because of <input> (${input.id}) on ios and android: a range form control: its scrollable overflow is not decided here`,
	);
	expect(error!.primarySpan?.filename).toBe('src/App.tsrx');
	expect(
		source.slice(error!.primarySpan!.start, error!.primarySpan!.start + '<input'.length),
	).toBe('<input');
});

it('a decided page, or an export from before page ranges, is no error; an undecided range with no reason is a harness error', async () => {
	const build = await compileNativeComponent({ filename: 'src/App.tsrx', source });
	const decided = { minX: 0, maxX: 0, minY: 0, maxY: 120 };
	expect(
		pageScrollDiagnostics(
			{ targets: { ios: { assignments: [{ pageScroll: decided }, {}] } } },
			build,
			'src/App.tsrx',
		),
	).toEqual([]);
	expect(() =>
		pageScrollDiagnostics(
			{ targets: { ios: { assignments: [{ pageScroll: null }] } } },
			build,
			'src/App.tsrx',
		),
	).toThrow('without naming why');
});
