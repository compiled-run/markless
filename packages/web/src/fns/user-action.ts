import type { RuntimeGraph } from '@markless/runtime';

/** Open from the moment a real DOM event's dispatch (or a call it made) starts until that call's own body, awaits included, has finished. */
export type UserActionToken = { open: boolean };

export type UserActionContext = {
	readonly graph?: RuntimeGraph;
	readonly userActionToken?: UserActionToken;
};

// Decided once per body so the end always undoes what the start did, whenever the token closes.
const loudBodies = new WeakMap<object, boolean>();

export function marklessUserActionIsLive(context: UserActionContext): boolean {
	return loudBodies.get(context) ?? context.userActionToken?.open === true;
}

/**
 * A write this body makes is loud (busy mark + announcement) only while the body runs inside a
 * real DOM event's dispatch, carried here by `userActionToken` (submit-quiet-design.md Q2); the
 * same body reached from a timer or socket message is quiet, even while an unrelated click is open.
 */
export function marklessUserActionStart(context: UserActionContext): void {
	const loud = context.userActionToken?.open === true;
	loudBodies.set(context, loud);
	if (loud) context.graph?.markUserActionStart?.();
	else context.graph?.markQuietStart?.();
}

export function marklessUserActionEnd(context: UserActionContext): void {
	const loud = marklessUserActionIsLive(context);
	loudBodies.delete(context);
	if (loud) context.graph?.markUserActionEnd?.();
	else context.graph?.markQuietEnd?.();
}
