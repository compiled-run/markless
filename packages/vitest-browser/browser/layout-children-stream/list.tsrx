import { computed } from '@markless/core';
import { load } from './load.ts';

export default function List({ label }: { readonly label: string }) @{
	const text = computed(async () => load(label, 120));
	@try {
		<p data-card>{text}</p>
	} @pending {
		<p data-card-pending>Loading {label}</p>
	}
}
