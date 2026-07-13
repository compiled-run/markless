import { computed, state } from '@markless/core';

export function App() @{
	let alpha = state('pending');
	let count = state(1);
	const exactName = computed(() => alpha === 'alpha' ? 2 : 0);
	const nameHyphen = computed(() => alpha === 'alpha-applied' ? 2 : 0);
	const shortSafe = computed(() => alpha === 'go' ? 2 : 0);
	const hyphenSafe = computed(() => alpha === 'zz-applied' ? 2 : 0);
	const prefixSafe = computed(() => alpha === 'alphaapplied' ? 2 : 0);
	const numeric = computed(() => count * 2);

	<section data-computed-string-literals>
		<button type="button" data-write="exact-name" onClick={() => alpha = 'alpha'}>Exact name</button>
		<output data-result="exact-name">{exactName}</output>

		<button type="button" data-write="name-hyphen" onClick={() => alpha = 'alpha-applied'}>Name with hyphen</button>
		<output data-result="name-hyphen">{nameHyphen}</output>

		<button type="button" data-write="short-safe" onClick={() => alpha = 'go'}>Short safe value</button>
		<output data-result="short-safe">{shortSafe}</output>

		<button type="button" data-write="hyphen-safe" onClick={() => alpha = 'zz-applied'}>Safe hyphen value</button>
		<output data-result="hyphen-safe">{hyphenSafe}</output>

		<button type="button" data-write="prefix-safe" onClick={() => alpha = 'alphaapplied'}>Safe prefix value</button>
		<output data-result="prefix-safe">{prefixSafe}</output>

		<button type="button" data-write="numeric" onClick={() => count++}>Numeric value</button>
		<output data-result="numeric">{numeric}</output>
	</section>
}
