import type { LinkBridgeModule } from '../../src/vite/runtime/create-server-entry.ts';

// The bridge a served page runs, as one classic script: the inline copy, or the shared module called with the page's part.
export function servedLinkBridge(
	html: string,
	entry: { readonly linkBridgeModules?: readonly LinkBridgeModule[] },
): string | undefined {
	const inline = /<script data-markless-router-link-resumer>([\s\S]*?)<\/script>/.exec(html)?.[1];
	if (inline !== undefined) return inline;
	const stub =
		/<script type="module" data-markless-router-link-resumer>import b from"([^"]+)";b\(([\s\S]*?)\)<\/script>/.exec(
			html,
		);
	if (!stub) return undefined;
	const module = entry.linkBridgeModules?.find((candidate) => candidate.path === stub[1]);
	if (!module)
		throw new Error(`the page imports a link bridge the entry did not build: ${stub[1]}`);
	const bridge = module.source
		.trim()
		.replace(/^export default/, '')
		.replace(/;$/, '');
	return `(()=>{const d=document,s=d.currentScript,r=s&&s.closest('[data-async-container]');if(!r)return;(${bridge})(${stub[2]});})();`;
}

// The bridge files a page loads only once it shows link intent or goes idle: the fragment navigation run half and its config.
export function laterLinkBridge(entry: {
	readonly linkBridgeModules?: readonly LinkBridgeModule[];
}): string {
	return (entry.linkBridgeModules ?? [])
		.slice(2)
		.map((module) => module.source)
		.join('\n');
}

// The page's route table, decoded: each destination's preloads, in order.
export function servedRouteTable(html: string): Record<string, unknown[]> | undefined {
	const json =
		/<script type="application\/json" data-markless-router-links>([\s\S]*?)<\/script>/.exec(
			html,
		)?.[1];
	if (json === undefined) return undefined;
	const [preloads, destinations] = JSON.parse(json) as [unknown[], Record<string, number[]>];
	return Object.fromEntries(
		Object.entries(destinations).map(([path, indexes]) => [
			path,
			indexes.map((at) => preloads[at]),
		]),
	);
}
