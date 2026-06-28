import { joinURL } from 'ufo';
import type { GlobalInjections } from '../types.ts';

export function createDevTags() {
	const tags: GlobalInjections[] = [];
	let viteTagsAdded = false;

	return {
		tags,
		register(tag: GlobalInjections) {
			tags.push(tag);
		},
		registerViteTags(base: string) {
			if (viteTagsAdded) {
				return;
			}
			viteTagsAdded = true;
			tags.unshift(headScript(base, '/@vite/client'));
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
