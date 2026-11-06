import type { RuntimeGraph } from '@markless/runtime';

type UserActionContext = { readonly graph?: RuntimeGraph };

/**
 * Opens a user action: a write before the matching end starts a loud refresh, any other write a
 * quiet one. Known gap: a callback prop a timer calls through capture-slot dispatch counts as loud.
 */
export function marklessUserActionStart(context: UserActionContext): void {
	context.graph?.markUserActionStart?.();
}

export function marklessUserActionEnd(context: UserActionContext): void {
	context.graph?.markUserActionEnd?.();
}
