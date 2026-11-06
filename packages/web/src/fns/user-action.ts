import type { RuntimeGraph } from '@markless/runtime';

type UserActionContext = { readonly graph?: RuntimeGraph };

/**
 * Marks an event handler's own turn as a user action (submit-quiet-design.md Q2): a write made
 * before the matching `marklessUserActionEnd` starts a loud refresh (busy mark + announcement); a
 * write made by anything else — a timer, a socket callback, a promise chain no handler started —
 * starts a quiet one instead. The handler's own body is wrapped in `try { ... } finally { end }`
 * (symbol-modules.ts), so an awaited continuation inside the same handler still counts: the
 * `finally` only runs once that continuation, not just the handler's first synchronous turn, completes.
 */
export function marklessUserActionStart(context: UserActionContext): void {
	context.graph?.markUserActionStart?.();
}

export function marklessUserActionEnd(context: UserActionContext): void {
	context.graph?.markUserActionEnd?.();
}
