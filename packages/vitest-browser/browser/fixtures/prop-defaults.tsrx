import { computed, state } from '@markless/core';

// A destructuring default on a prop is plain JavaScript: it stands in for an
// omitted or undefined prop, and every reader of the local sees it.
export function Stars({ size = 3 }: { size?: number }) @{
	const picked = state({ value: -1 });
	const label = computed(() => `${size} stars`);

	<div data-stars data-size={size}>
		<span data-row>{'★'.repeat(size)}</span>
		<i data-label>{label}</i>
		@if (size > 4) {
			<em data-big>big</em>
		}
		<button type="button" data-pick onClick={() => { picked.value = size; }}>pick</button>
		<output data-picked>{picked.value}</output>
	</div>
}

export function Tags({ tags, max = 2 }: { tags: string[]; max?: number }) @{
	<ul data-tags>
		@for (const tag of tags.slice(0, max); key tag) {
			<li>{tag}</li>
		}
	</ul>
}
