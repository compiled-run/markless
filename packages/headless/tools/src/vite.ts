import type { IconsOptions } from '@markless/icons/vite';
import type { Plugin } from 'vite';
import { iconTransform } from './transforms/icons.ts';

export interface UiOptions {
	icons?: false | IconsOptions;
}

// @markless/bundler owns this name; ui-tools must not depend on that package to read it.
const marklessPluginName = 'vite-plugin-markless';
const pluginName = '@markless/ui-tools';

export function ui(options: UiOptions = {}): Plugin {
	const transform = options.icons === false ? undefined : iconTransform(options.icons);
	return {
		name: pluginName,
		enforce: 'pre',
		config() {
			return { optimizeDeps: { exclude: ['@markless/ui'] } };
		},
		configResolved(config) {
			const names = config.plugins.map((plugin) => plugin.name);
			const markless = names.indexOf(marklessPluginName);
			const self = names.indexOf(pluginName);
			if (markless === -1 || self === -1 || self < markless) return;
			throw new Error(
				`@markless/ui-tools: markless() runs before ui(), so icon tags reach the compiler untouched. List ui() from '@markless/ui/vite' before markless() in vite.config.`,
			);
		},
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
