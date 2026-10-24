type CompressedAssetsNitro = {
	options: {
		serveStatic?: boolean | string;
		compressPublicAssets?: boolean | { gzip?: boolean; brotli?: boolean; zstd?: boolean };
	};
};

// A server that serves its own files (node, bun, deno) gets gzip and brotli copies; a host with a CDN (vercel, netlify) compresses at its edge.
export function compressedAssetsModule(configured: boolean) {
	return {
		name: 'markless-router:compressed-assets',
		setup(nitro: CompressedAssetsNitro) {
			const { serveStatic } = nitro.options;
			if (configured || !serveStatic || serveStatic === 'inline') return;
			nitro.options.compressPublicAssets = { gzip: true, brotli: true };
		},
	};
}
