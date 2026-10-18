import { computed } from '@markless/core';

export function Details({ direction }: { readonly direction: string }) @{
	const cls = computed(() => (direction === 'bottom' ? 'row' : 'col'));
	const dir = computed(() => direction.toUpperCase());
	<section data-details class={cls}>
		<output data-dock>{dir}</output>
		<Badge direction={dir} />
	</section>;
}

function Badge({ direction }: { readonly direction: string }) @{
	const label = computed(() => `badge ${direction}`);
	<span data-badge>{label}</span>;
}

export function Meter({
	level,
	side,
}: {
	readonly level: number;
	readonly side: string;
}) @{
	const doubled = computed(() => level * 2);
	<div data-meter>
		<Gauge level={doubled} side={side} />
		<em data-level>{level}</em>
	</div>;
}

function Gauge({ level, side }: { readonly level: number; readonly side: string }) @{
	const shown = computed(() => `${side}:${level}`);
	<meter data-gauge title={shown} value={level}></meter>;
}
