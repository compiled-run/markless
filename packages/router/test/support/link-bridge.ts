// The bridge a served page runs, as one classic script: the inline copy, or the shared module called with the page's part.
export async function servedLinkBridge(
	html: string,
	entry: { fetch(request: Request): Promise<Response> },
	origin = 'http://router.test',
): Promise<string | undefined> {
	const inline = /<script data-markless-router-link-resumer>([\s\S]*?)<\/script>/.exec(html)?.[1];
	if (inline !== undefined) return inline;
	const stub = /<script type="module" data-markless-router-link-resumer>import b from"([^"]+)";b\(([\s\S]*?)\)<\/script>/.exec(
		html,
	);
	if (!stub) return undefined;
	const response = await entry.fetch(new Request(new URL(stub[1]!, origin)));
	const module = (await response.text()).trim();
	const bridge = module.replace(/^export default/, '').replace(/;$/, '');
	return `(()=>{const d=document,s=d.currentScript,r=s&&s.closest('[data-async-container]');if(!r)return;(${bridge})(${stub[2]});})();`;
}
