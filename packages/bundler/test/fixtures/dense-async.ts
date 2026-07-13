export type DenseAsyncShape = {
	readonly computeds: number;
	readonly boundaries: number;
};

export function denseAsyncSource(shape: DenseAsyncShape): string {
	const computeds = Array.from(
		{ length: shape.computeds },
		(_, index) =>
			`\tconst level${index} = computed(async () => ({ value: version + ${index} }));`,
	).join('\n');
	const boundaries = Array.from({ length: shape.boundaries }, (_, index) => {
		const computedIndex = Math.min(index, shape.computeds - 1);
		return `\t\t<section data-boundary="${index}">@try { <span>{level${computedIndex}.value}</span> } @pending { <i>pending</i> } @catch { <b>failed</b> }</section>`;
	}).join('\n');

	return `import { computed, state } from '@markless/core';

export function App() @{
	let version = state(0);
${computeds}
	<main>
		<button onClick={() => version++}>bump</button>
${boundaries}
	</main>
}
`;
}
