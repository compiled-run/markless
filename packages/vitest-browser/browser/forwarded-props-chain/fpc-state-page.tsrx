import { computed, state } from '@markless/core';

function InnerText({ value }: { readonly value: string }) @{
	<i>{value}</i>;
}

function InnerComputed({ value }: { readonly value: string }) @{
	const shown = computed(() => `got ${value}`);
	<b>{shown}</b>;
}

function Outer({ value }: { readonly value: string }) @{
	<section>
		<InnerText value={value} />
		<InnerComputed value={value} />
	</section>;
}

export default function ForwardedStatePage() @{
	let n = state('0');
	<main>
		<button type="button" data-next onClick={() => (n = n + '1')}>
			next
		</button>
		<Outer value={n} />
	</main>;
}
