import { createLanguageServicePlugin } from '@volar/typescript/lib/quickstart/createLanguageServicePlugin.js';
import { getMarklessTsrxLanguagePlugin } from './language.ts';

const plugin = createLanguageServicePlugin(() => ({
	languagePlugins: [getMarklessTsrxLanguagePlugin()],
}));

Object.defineProperty(plugin, '__getMarklessTsrxLanguagePlugin', {
	value: getMarklessTsrxLanguagePlugin,
});

export default plugin;
