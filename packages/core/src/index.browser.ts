// The browser root: server rendering and resume load when called, so a client build never reaches them statically.
export {
	computed,
	element,
	shared,
	state,
	storage,
	FrameworkApiRuntimeError,
} from './framework-api.ts';
export type {
	AsyncComputedValue,
	ElementHandle,
	FrameworkApiName,
	FrameworkApiRuntimeDiagnostic,
	SharedDefinition,
	SharedOptions,
	SharedScope,
} from './framework-api.ts';
export type { Children, Component, PropsOf, Seeded } from './jsx-types.ts';
export { render } from './render.ts';
export type {
	CsrRenderArtifact,
	CsrRenderContainer,
	CsrRenderOptions,
	CsrRenderOutput,
	CsrRenderable,
	RenderTarget,
} from './render.ts';
export type {
	RenderToStringOptions,
	SsrRenderArtifact,
	SsrRenderable,
	SsrRenderOutput,
} from '@markless/web/render-to-string';
export type {
	ResumePayloadDocumentInput,
	ResumePayloadScriptsInput,
	ResumePayloadScriptsResult,
} from '@markless/web/resume';

type StringRendering = typeof import('@markless/web/render-to-string');
type PayloadResuming = typeof import('@markless/web/resume');

export async function renderToString(
	...input: Parameters<StringRendering['renderToString']>
): ReturnType<StringRendering['renderToString']> {
	return (await import('@markless/web/render-to-string')).renderToString(...input);
}

export async function resumeFromPayloadDocument(
	...input: Parameters<PayloadResuming['resumeFromPayloadDocument']>
): ReturnType<PayloadResuming['resumeFromPayloadDocument']> {
	return (await import('@markless/web/resume')).resumeFromPayloadDocument(...input);
}

export async function resumeFromPayloadScripts(
	...input: Parameters<PayloadResuming['resumeFromPayloadScripts']>
): ReturnType<PayloadResuming['resumeFromPayloadScripts']> {
	return (await import('@markless/web/resume')).resumeFromPayloadScripts(...input);
}
