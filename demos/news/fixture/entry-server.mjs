import { renderToString } from '@markless/web';
import News from './app.tsrx';

// resumeModuleUrl makes renderToString emit the real inline-resumer bootstrap
// (early event capture + resume module load); without it the document carries
// a no-op stub and every interaction before manual wiring is silently lost.
export async function renderApp({ resumeModuleUrl, modulePreloads } = {}) {
	return renderToString(News, { executionLog: 'never', resumeModuleUrl, modulePreloads });
}
