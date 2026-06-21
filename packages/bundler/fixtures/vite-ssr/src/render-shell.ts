import { renderToString, type SsrRenderOutput } from '@arcade/runtime/render-to-string';

export type PayloadScripts = Required<Pick<SsrRenderOutput, 'state' | 'view'>>;

export function renderServerShell(payloadScripts: PayloadScripts, resumeModuleUrl = ''): string {
	return renderToString(
		() => ({
			html: '<button type="button" data-counter>0</button><span>hello</span>',
			state: payloadScripts.state,
			view: payloadScripts.view,
		}),
		{ resumeModuleUrl },
	);
}
