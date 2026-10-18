import { markless } from '@markless/core/vite';
import { router } from '@markless/router/vite';
import { defineConfig, type Plugin } from 'vite-plus';

// Witness-only instrumentation: the production demo config keeps the stripped
// default. The prerender-wake channel is witness-opt-in until the tier
// demolition frees its shipped-JS wall cost (runtime-demolition T004/T006).
const plugins = (() => {
	const previousWake = process.env.MARKLESS_PRERENDER_WAKE;
	process.env.MARKLESS_PRERENDER_WAKE = '1';
	try {
		return [markless({ executionLog: 'auto' }), router()];
	} finally {
		if (previousWake === undefined) delete process.env.MARKLESS_PRERENDER_WAKE;
		else process.env.MARKLESS_PRERENDER_WAKE = previousWake;
	}
})();

const YOUTUBE_COVER = /https:\/\/i\.ytimg\.com\/vi\/([\w-]+)\/maxresdefault\.jpg/g;

// The box page's load event waited on live i.ytimg.com covers, so a slow CDN timed out the visit;
// the box build serves a same-origin placeholder per cover instead.
function localCovers(): Plugin {
	const ids = new Set<string>();
	return {
		name: 'music-player-ssr-box:local-covers',
		enforce: 'pre',
		transform(code, id) {
			if (id.includes('/node_modules/') || !code.includes('i.ytimg.com')) return null;
			return code.replace(YOUTUBE_COVER, (_whole, video: string) => {
				ids.add(video);
				return `/covers/${video}.svg`;
			});
		},
		generateBundle() {
			if (this.environment?.name !== 'client') return;
			for (const video of ids) {
				this.emitFile({
					type: 'asset',
					fileName: `covers/${video}.svg`,
					source: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 9"><rect width="16" height="9" fill="#2f4f66"/><text x="8" y="5.5" font-size="2" text-anchor="middle" fill="#fff">${video}</text></svg>`,
				});
			}
		},
	};
}

export default defineConfig({
	plugins: [localCovers(), ...plugins],
});
