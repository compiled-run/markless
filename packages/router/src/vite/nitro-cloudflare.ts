import { isCloudflarePreset } from './nitro-compressed-assets.ts';

interface CloudflareNitro {
	readonly options: {
		readonly preset?: string;
		readonly dev?: boolean;
		prerender: { autoSubfolderIndex?: boolean };
	};
}

// Cloudflare serves an asset only at the URL its file name implies and redirects the other spelling,
// so a prerendered page is written as `guide.html` for `/guide` and `guide/index.html` for `/guide/`.
export function cloudflareModule(configured: { readonly autoSubfolderIndex: boolean }) {
	return {
		name: 'markless-router:cloudflare',
		setup(nitro: CloudflareNitro) {
			if (nitro.options.dev || !isCloudflarePreset(nitro.options.preset)) return;
			if (!configured.autoSubfolderIndex) nitro.options.prerender.autoSubfolderIndex = false;
		},
	};
}
