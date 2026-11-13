import type {
	ProtocolSyncPolicy,
	ProtocolSyncPolicyBranch,
	ProtocolSyncPolicyCondition,
} from '../../../serializer/src/protocol.ts';

export type SyncPolicyGraph = {
	read(graphNodeId: string, path?: ReadonlyArray<string>): unknown;
};

export type SyncPolicyDomEvent = {
	readonly preventDefault?: () => void;
	readonly stopPropagation?: () => void;
	readonly [key: string]: unknown;
};

export function runSyncPolicyActions(
	policy: ProtocolSyncPolicy,
	graph: SyncPolicyGraph,
	event: SyncPolicyDomEvent,
): void {
	// The analyzer's in-place policy cancels only after every listener has run (serializer `isInPlaceSubmitPolicy`, not imported so it ships no module).
	if (!('branches' in policy) && policy.when.type === 'submits-in-place')
		return void inPlaceSubmission(event as unknown as SubmitEvent, true);
	for (const branch of syncPolicyBranches(policy)) {
		if (!evaluateSyncPolicy(branch.when, graph, event)) continue;

		for (const action of branch.actions) {
			if (action === 'preventDefault') event.preventDefault?.();
			if (action === 'stopPropagation') event.stopPropagation?.();
		}
	}
}

function evaluateSyncPolicy(
	condition: ProtocolSyncPolicyCondition,
	graph: SyncPolicyGraph,
	event: SyncPolicyDomEvent,
): boolean {
	if (condition.type === 'and') {
		return condition.conditions.every((child) => evaluateSyncPolicy(child, graph, event));
	}
	if (condition.type === 'or') {
		return condition.conditions.some((child) => evaluateSyncPolicy(child, graph, event));
	}
	if (condition.type === 'not') return !evaluateSyncPolicy(condition.condition, graph, event);
	if (condition.type === 'graph-truthy') {
		const value = graph.read(condition.graphNodeId, condition.path ?? []);
		return 'equals' in condition ? value === condition.equals : Boolean(value);
	}
	if (condition.type === 'constant-truthy') return Boolean(condition.value);
	if (condition.type === 'submits-in-place') return false;

	return event[condition.field] === condition.value;
}

function syncPolicyBranches(policy: ProtocolSyncPolicy): ReadonlyArray<ProtocolSyncPolicyBranch> {
	if ('branches' in policy) return policy.branches;

	return [policy];
}


type Submitter = HTMLButtonElement | HTMLInputElement;

/** A submit kept from the browser to be sent in place: where it goes, how it is encoded, what it carried at the press, and the browser's own submit to fall back to. */
export type KeptSubmission = {
	readonly action: string;
	readonly enctype: string;
	readonly data: FormData;
	readonly native: () => void;
};

/**
 * What the browser would send for this submit when it is a same-origin POST in this tab; otherwise undefined.
 * With `later`, it waits until the event has passed every listener and keeps the submit from the browser only if none
 * cancelled it, marking the form busy; the event carries a promise of that submission, settled once the event is done. The inline boot embeds this function's
 * source, so it reads only the event and the document, and names only itself; comments stay outside its body, which
 * ships as text. A field named like a form property shadows it on the element, so the form is read through its
 * prototype. A listener that stops the event keeps it from the window: the browser submits, and nothing is sent here.
 */
export function inPlaceSubmission(event: SubmitEvent, later?: boolean): KeptSubmission | undefined {
	const form = event.target as HTMLFormElement & { __mNative?: 1 };
	const by = event.submitter as Submitter | null;
	const prototype = HTMLFormElement.prototype;
	const own = (name: string) => Object.getOwnPropertyDescriptor(prototype, name)!.get!.call(form);
	const chosen = (name: string, property: string) =>
		by && by.hasAttribute('form' + name) ? (by as unknown as Record<string, string>)[property] : own(name);
	if (later) {
		const marked = event as SubmitEvent & { __mKept?: Promise<KeptSubmission | undefined> };
		if (marked.__mKept) return;
		let settle!: (kept?: KeptSubmission) => void;
		marked.__mKept = new Promise((resolve) => (settle = resolve));
		const late = (seen: Event) => {
			if (seen !== event) return;
			removeEventListener('submit', late);
			const kept = inPlaceSubmission(event);
			if (kept) {
				event.preventDefault();
				Element.prototype.setAttribute.call(form, 'aria-busy', 'true');
				(Element.prototype.closest.call(form, '[data-async-container]') as { __mResume?: Promise<unknown> } | null)
					?.__mResume?.catch(kept.native);
			}
			settle(kept);
		};
		addEventListener('submit', late);
		setTimeout(() => {
			removeEventListener('submit', late);
			settle();
		});
		return;
	}
	const target: string | null | undefined =
		chosen('target', 'formTarget') || document.querySelector('base[target]')?.getAttribute('target');
	const action: string = chosen('action', 'formAction');
	if (
		event.defaultPrevented ||
		form.__mNative ||
		chosen('method', 'formMethod') != 'post' ||
		(target && target.toLowerCase() != '_self') ||
		own('relList').contains('external') ||
		new URL(action).origin != location.origin
	)
		return;
	return {
		action,
		enctype: chosen('enctype', 'formEnctype'),
		data: new FormData(form, by),
		native() {
			form.__mNative = 1;
			try {
				prototype.requestSubmit.call(form, by);
			} finally {
				delete form.__mNative;
			}
		},
	};
}
