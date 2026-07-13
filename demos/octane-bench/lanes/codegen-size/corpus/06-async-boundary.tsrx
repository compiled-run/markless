import { computed } from '@markless/core';
export function AsyncBoundary() @{
	const report = computed(async () => ({ title: 'Ready', count: 4 }));
	<section>@try { <article><h2>{report.title}</h2><p>{report.count}</p></article> } @pending { <p>Loading</p> } @catch { <p>Failed</p> }</section>
}
