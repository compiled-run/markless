import { computed, state } from '@markless/core';

function Shout({ dock, tags }: { readonly dock: string; readonly tags: readonly string[] }) @{
	const loud = computed(() => dock.toUpperCase());
	const joined = computed(() => tags.join('+'));
	<p>
		<output data-loud>{loud}</output>
		<output data-joined>{joined}</output>
	</p>;
}

export default function ForwardedPropsPage() @{
	let side = state('right');
	let labels = state(['a']);
	<main>
		<button
			type="button"
			data-toggle
			onClick={() => {
				side = side === 'right' ? 'bottom' : 'right';
				labels = [...labels, 'b'];
			}}
		>
			t
		</button>
		<p data-own>{side}</p>
		<Shout dock={side} tags={labels} />
	</main>;
}
