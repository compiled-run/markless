import { computed } from '@markless/core';

export default function ConstTag({ kind }: { kind: string }) @{
	const label = computed(() => `tag ${kind}`);
	<p data-r>{label}</p>
}
