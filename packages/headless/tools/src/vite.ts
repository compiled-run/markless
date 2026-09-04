import type { IconsOptions } from '@markless/icons/vite';
import type { Plugin } from 'vite';
import { iconTransform } from './transforms/icons.ts';

export interface UiOptions {
	icons?: false | IconsOptions;
}

export function ui(options: UiOptions = {}): Plugin {
	const transform = options.icons === false ? undefined : iconTransform(options.icons);
	return {
		name: '@markless/ui-tools',
		enforce: 'pre',
		transform: {
			order: 'pre',
			async handler(code, id, transformOptions) {
				if (!transform) return;
				const handler = typeof transform === 'function' ? transform : transform.handler;
				return handler.call(this, code, id, transformOptions);
			},
		},
	};
}
