import { computed } from '@markless/core';
import { JsonView, type Field } from './deep/parity/json-view.tsrx';

export function Details({
	fields,
	direction,
}: {
	readonly fields: readonly Field[];
	readonly direction: string;
}) @{
	const cls = computed(() => (direction === 'bottom' ? 'row' : 'col'));
	const dir = computed(() => direction.toUpperCase());
	<section data-details class={cls}>
		<output data-dock>{dir}</output>
		<Badge direction={dir} />
		<JsonView fields={fields} />
	</section>;
}

function Badge({ direction }: { readonly direction: string }) @{
	const label = computed(() => `badge ${direction}`);
	<span data-badge>{label}</span>;
}
