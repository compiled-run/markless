import { computed, state } from '@markless/core';

export function Summary({ items, config }: { readonly items: ReadonlyArray<string>; readonly config: { readonly title: string; readonly tags: ReadonlyArray<string> } }) @{
	const seen = state({ count: 0 });
	const label = computed(() => config.title + ' [' + config.tags.join('+') + '] ' + items.length + ' items, ' + seen.count + ' clicks');
	<button type="button" data-summary={config.title} onClick={() => { seen.count = seen.count + 1; }}>{label}</button>
}
