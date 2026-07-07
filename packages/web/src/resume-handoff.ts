import type { RuntimeGraphSharedPatch } from '@markless/runtime';
import type { ResumeDomElement, ResumeDomEvent, ResumeSharedPatchDispatcher, ResumeSharedPatchEvent } from './resume-types.ts';

export const SHARED_PATCH_EVENT_TYPE = 'async:shared-patch';

export function defaultSharedPatchDispatcher(root: ResumeDomElement): ResumeSharedPatchDispatcher | undefined {
	if (!root.dispatchEvent) return;
	return (patch) => { root.dispatchEvent?.(createSharedPatchEvent(patch)); };
}
export function isResumeSharedPatchEvent(event: ResumeDomEvent | ResumeSharedPatchEvent): event is ResumeSharedPatchEvent {
	return event.type === SHARED_PATCH_EVENT_TYPE && isRuntimeGraphSharedPatch((event as { readonly detail?: unknown }).detail);
}
function createSharedPatchEvent(patch: RuntimeGraphSharedPatch): ResumeSharedPatchEvent {
	const CustomEventConstructor = (globalThis as { readonly CustomEvent?: new (type: typeof SHARED_PATCH_EVENT_TYPE, init: { readonly detail: RuntimeGraphSharedPatch; readonly bubbles: true; readonly cancelable: false; readonly composed: true }) => ResumeSharedPatchEvent }).CustomEvent;
	const init = { detail: patch, bubbles: true, cancelable: false, composed: true } as const;
	return CustomEventConstructor ? new CustomEventConstructor(SHARED_PATCH_EVENT_TYPE, init) : { type: SHARED_PATCH_EVENT_TYPE, ...init };
}
function isRuntimeGraphSharedPatch(value: unknown): value is RuntimeGraphSharedPatch {
	if (!value || typeof value !== 'object') return false;
	const patch = value as { readonly id?: unknown; readonly scope?: unknown; readonly version?: unknown; readonly patch?: unknown };
	return typeof patch.id === 'string' && (patch.scope === undefined || typeof patch.scope === 'string') && typeof patch.version === 'number' && Number.isInteger(patch.version) && Array.isArray(patch.patch) && patch.patch.every((op) => Array.isArray(op) && op.length === 3 && op[0] === 'set' && Array.isArray(op[1]) && op[1].every((s) => typeof s === 'string'));
}
