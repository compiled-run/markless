<script lang="ts">
	import '$lib/shared/styles.css';
	import { page } from '$app/state';
	import { version } from '$app/environment';
	import TreeNode from '$lib/TreeNode.svelte';
	import { ROUTES, SIDEBAR_TREE, SITE_TITLE, documentTitle } from '$lib/shared/data';

	let { children } = $props();
	const route = $derived(ROUTES.find((r) => r.path === page.url.pathname));
</script>

<svelte:head>
	<title>{route ? documentTitle(route) : SITE_TITLE}</title>
	<meta name="benchmark:entrant" content="sveltekit" />
	<meta name="benchmark:build" content={version} />
</svelte:head>

<div class="app">
	<header class="app-header">
		<span class="app-brand">{SITE_TITLE}</span>
		<nav class="app-nav" aria-label="Main">
			{#each ROUTES as r (r.id)}
				<a
					data-testid={r.navTestId}
					href={r.path}
					aria-current={route?.id === r.id ? 'page' : undefined}>{r.title}</a
				>
			{/each}
		</nav>
	</header>
	<div class="app-body">
		<aside class="sidebar" aria-label="Sections">
			<ul class="tree">
				{#each SIDEBAR_TREE as node (node.id)}
					<TreeNode {node} />
				{/each}
			</ul>
		</aside>
		<main class="main">
			<h1 class="page-title" data-testid="page-title">{route?.title ?? ''}</h1>
			{@render children()}
		</main>
	</div>
</div>
