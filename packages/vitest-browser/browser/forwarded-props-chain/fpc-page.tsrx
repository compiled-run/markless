import { computed, state } from '@markless/core';

function Inner({ value }: { readonly value: string | null }) @{
	const shown = computed(() => (value ? `got ${value}` : 'none'));
	<p>{shown}</p>;
}

function Outer({ value }: { readonly value: string | null }) @{
	<section data-outer>
		<Inner value={value} />
	</section>;
}

export default function PropForwardedPage() @{
	let n = state(0);
	const value = computed(() => (n ? `v${n}` : null));
	<main>
		<button type="button" data-next onClick={() => n++}>
			next
		</button>
		<div data-direct>
			<Inner value={value} />
		</div>
		<Outer value={value} />
	</main>;
}
