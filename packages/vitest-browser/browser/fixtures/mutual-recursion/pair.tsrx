import { computed, state } from '@markless/core';

export default function OneFilePage() @{
	let depth = state(2);

	<main>
		<Outer depth={depth} />
	</main>
}

export function Outer({ depth }: { depth: number }) @{
	let open = state(true);

	<div data-outer>
		<button type="button" data-flip onClick={() => (open = !open)}>{open ? 'open' : 'closed'}</button>
		<Inner depth={depth} />
	</div>
}

export function Inner({ depth }: { depth: number }) @{
	const deeper = computed(() => (depth > 0 ? [depth - 1] : []));

	<div data-inner>
		{depth}
		@for (const next of deeper; key next) {
			<Outer depth={next} />
		}
	</div>
}
