import { renderToString } from '@markless/web';
import { App } from './app.tsrx';

export async function renderApp({ resumeModuleUrl, modulePreloads } = {}) {
	return renderToString(App, { executionLog: 'never', resumeModuleUrl, modulePreloads });
}
