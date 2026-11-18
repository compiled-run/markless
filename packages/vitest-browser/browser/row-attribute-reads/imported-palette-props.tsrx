import { computed, state } from '@markless/core';

const STARS = [
	{ name: 'vega', label: 'Vega' },
	{ name: 'rigel', label: 'Rigel' },
	{ name: 'deneb', label: 'Deneb' },
];

export default function StarPicker(props: { readonly selected: string; readonly onSelect: (name: string) => void }) @{
	let mounted = state(true);
	const chosen = computed(() => props.selected);
	<section>
		<button type="button" data-toggle onClick={() => mounted = !mounted}>Stars</button>
		@if (mounted) {
			<ol data-list>
				@for (const star of STARS; key star.name) {
					<li data-item={star.name} data-checked={chosen === star.name ? 'true' : 'false'} onClick={() => props.onSelect(star.name)}>{star.label}</li>
				}
			</ol>
		}
	</section>
}
