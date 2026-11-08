import { computed, state } from '@markless/core';

const STARS = [
	{ name: 'vega', label: 'Vega' },
	{ name: 'rigel', label: 'Rigel' },
	{ name: 'deneb', label: 'Deneb' },
];

export default function StarPalette({ current, onPick }: { readonly current: string; readonly onPick: (name: string) => void }) @{
	let mounted = state(true);
	const picked = computed(() => current);
	<div>
		<button type="button" data-toggle onClick={() => mounted = !mounted}>Stars</button>
		@if (mounted) {
			<ul data-list>
				@for (const star of STARS; key star.name) {
					<li data-item={star.name} data-checked={picked === star.name ? 'true' : 'false'} onClick={() => onPick(star.name)}>{star.label}</li>
				}
			</ul>
		}
	</div>
}
