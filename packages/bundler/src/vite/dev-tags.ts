import { joinURL } from 'ufo';
import type { GlobalInjections } from '../types.ts';
import { ARCADE_DEV_CLIENT_PATH } from './hmr.ts';

export function createDevTags() {
	const tags: GlobalInjections[] = [];
	let viteTagsAdded = false;

	return {
		tags,
		register(tag: GlobalInjections) {
			tags.push(tag);
		},
		registerViteTags(base: string, hmrEnabled: boolean) {
			if (viteTagsAdded) {
				return;
			}
			viteTagsAdded = true;
			const viteTags = [headScript(base, '/@vite/client')];
			if (hmrEnabled) {
				viteTags.push(headScript(base, ARCADE_DEV_CLIENT_PATH));
			}
			tags.unshift(...viteTags);
		},
	};
}

export function headScript(base: string, src: string): GlobalInjections {
	return {
		tag: 'script',
		location: 'head',
		attributes: { type: 'module', src: joinURL(base, src) },
	};
}

export function headStylesheet(base: string, href: string): GlobalInjections {
	return {
		tag: 'link',
		location: 'head',
		attributes: { rel: 'stylesheet', href: joinURL(base, href) },
	};
}
