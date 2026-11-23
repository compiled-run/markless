import { computed } from '@markless/core';
import type { PageProps } from '@markless/router';

export default function Note({ params, url }: PageProps<{ id: string }>) @{
	const tab = computed(() => url.searchParams.get('tab') ?? 'no tab');
	<main>
		<title>Note</title>
		<h1>Note {params.id}</h1>
		<p>Note path {url.pathname}</p>
		<p>Note search [{url.search}]</p>
		<p>Note hash [{url.hash}]</p>
		<p>Note tab {tab}</p>
	</main>
}
