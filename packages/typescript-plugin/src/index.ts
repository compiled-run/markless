import { createLanguageServicePlugin } from '@volar/typescript/lib/quickstart/createLanguageServicePlugin.js';
import { installMarklessCompletions } from './completions.ts';
import { getMarklessTsrxLanguagePlugin } from './language.ts';

const volarPlugin = createLanguageServicePlugin(() => ({
	languagePlugins: [getMarklessTsrxLanguagePlugin()],
}));

const plugin = (modules: Parameters<typeof volarPlugin>[0]) => {
	const volar = volarPlugin(modules);
	return {
		...volar,
		create(info: Parameters<typeof volar.create>[0]) {
			const getSourceSnapshot = info.languageServiceHost.getScriptSnapshot.bind(
				info.languageServiceHost,
			);
			const languageService = volar.create(info);
			const enhancedLanguageService = Object.create(null);
			for (const key of Object.keys(languageService)) {
				const value = languageService[key as keyof typeof languageService];
				enhancedLanguageService[key] =
					typeof value === 'function' ? value.bind(languageService) : value;
			}
			installMarklessCompletions(
				modules.typescript,
				info,
				enhancedLanguageService,
				getSourceSnapshot,
			);
			return enhancedLanguageService;
		},
	};
};

Object.defineProperty(plugin, '__getMarklessTsrxLanguagePlugin', {
	value: getMarklessTsrxLanguagePlugin,
});

export default plugin;
