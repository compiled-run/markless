import { renderToStream } from '@markless/web/render-to-stream';
import App from './app.tsrx';
import { configureData } from './data.ts';

export async function renderAppStream({ apiOrigin, run, resumeModuleUrl, modulePreloads }) {
	configureData(apiOrigin, run);
	return renderToStream(App, { executionLog: 'never', resumeModuleUrl, modulePreloads });
}
