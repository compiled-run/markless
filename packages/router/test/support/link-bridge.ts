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
