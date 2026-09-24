<script lang="ts">
	import type { TreeNode } from '$lib/shared/data';
	import Self from './TreeNode.svelte';

	let { node }: { node: TreeNode } = $props();
	let expanded = $state(false);
</script>

{#if node.children}
	<li>
		<button
			type="button"
			class="tree-toggle"
			data-testid="disclosure-{node.id}"
			aria-expanded={expanded ? 'true' : 'false'}
			aria-controls="disclosure-panel-{node.id}"
			onclick={() => (expanded = !expanded)}>{node.label}</button
		>
		<ul
			class="tree-panel"
			id="disclosure-panel-{node.id}"
			data-testid="disclosure-panel-{node.id}"
			hidden={!expanded}
		>
			{#each node.children as child (child.id)}
				<Self node={child} />
			{/each}
		</ul>
	</li>
{:else}
	<li><span class="tree-leaf" data-testid="tree-leaf-{node.id}">{node.label}</span></li>
{/if}
