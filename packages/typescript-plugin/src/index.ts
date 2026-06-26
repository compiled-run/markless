import { createLanguageServicePlugin } from '@volar/typescript/lib/quickstart/createLanguageServicePlugin.js';
import { getArcadeTsrxLanguagePlugin } from './language.ts';

const plugin = createLanguageServicePlugin(() => ({
	languagePlugins: [getArcadeTsrxLanguagePlugin()],
}));

Object.defineProperty(plugin, '__getArcadeTsrxLanguagePlugin', {
	value: getArcadeTsrxLanguagePlugin,
});

export default plugin;
