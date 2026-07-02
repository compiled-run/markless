import { describe, expect, it } from 'vite-plus/test';
import { startRouteUpdateRenderer } from '../src/route-renderer.ts';
import { dispatchRouteUpdate } from '../src/route-state.ts';

describe('route update renderer', () => {
	it('does not run page artifact preloads during router CSR route render', async () => {
		let mounted: unknown;
		const document = Object.assign(new EventTarget(), {
			body: {
				replaceChildren(root: unknown) {
					mounted = root;
				},
			},
		}) as Document;
		let preloadCalls = 0;
		let renderedPathname = '';

		startRouteUpdateRenderer(document);
		dispatchRouteUpdate(document, {
			page: {
				default: {
					preload() {
						preloadCalls++;
					},
					renderCsr(props: { readonly url: { readonly pathname: string } }) {
						renderedPathname = props.url.pathname;
						return {
							graph: {},
							root: 'root',
							runtime: { dispatch: async () => {} },
						};
					},
				},
			},
			route: {
				file: 'pages/docs.tsrx',
				params: {},
				status: 200,
				url: 'http://markless.test/docs',
			},
		});
		await Promise.resolve();

		expect(preloadCalls).toBe(0);
		expect(renderedPathname).toBe('/docs');
		expect(mounted).toBe('root');
	});
});
