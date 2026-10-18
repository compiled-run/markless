import { computed } from '@markless/core';

function InnerText({ value }: { readonly value: string }) @{
	<i>{value}</i>;
}

function InnerComputed({ value }: { readonly value: string }) @{
	const shown = computed(() => `got ${value}`);
	<b>{shown}</b>;
}

export function Outer({ value }: { readonly value: string }) @{
	<section>
		<InnerText value={value} />
		<InnerComputed value={value} />
	</section>;
}
