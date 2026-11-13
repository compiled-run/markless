import { computed } from '@markless/core';

export default function Tag({ kind, value }: { kind: string; value: { odd: boolean } }) @{
	const label = computed(() => `tag ${kind}`);
	<p data-r data-odd={String(value.odd)}>{label}</p>
}
