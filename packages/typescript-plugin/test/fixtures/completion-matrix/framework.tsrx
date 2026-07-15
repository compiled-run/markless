import { /*M1_IMPORT*/ state, computed } from '@markless/core';

export function Framework() @{
	const model = state({ title: 'Markless', count: 1 });
	const derived = computed(() => ({ summary: model.title, doubled: model.count * 2 }));
	state/*M1_STATE*/;
	computed/*M1_COMPUTED*/;
	model./*M2_STATE*/;
	derived./*M2_COMPUTED*/;
	<span>{derived.summary}</span>
}
