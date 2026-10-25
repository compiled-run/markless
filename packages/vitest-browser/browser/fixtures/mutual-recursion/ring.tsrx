import { computed, state } from '@markless/core';

export default function RingPage() @{
	let left = state(2);

	<main>
		<RingA left={left} />
	</main>
}

export function RingA({ left }: { left: number }) @{
	let hits = state(0);

	<section data-ring-a>
		<a href="#" data-ring-hit onClick={(event) => { event.preventDefault(); hits++; }}>{hits}</a>
		<RingB left={left} />
	</section>
}

export function RingB({ left }: { left: number }) @{
	<article data-ring-b>
		<RingC left={left} />
	</article>
}

export function RingC({ left }: { left: number }) @{
	const more = computed(() => (left > 0 ? [left - 1] : []));

	<aside data-ring-c data-left={left}>
		@for (const rest of more; key rest) {
			<RingA left={rest} />
		}
	</aside>
}
