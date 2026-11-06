import type { RuntimeGraph } from '@markless/runtime';

type UserActionContext = { readonly graph?: RuntimeGraph };

/**
 * Marks an event handler's own turn as a user action (submit-quiet-design.md Q2): a write made
 * before the matching `marklessUserActionEnd` starts a loud refresh (busy mark + announcement); a
 * write made by anything else — a timer, a socket callback, a promise chain no handler started —
 * starts a quiet one instead. The handler's own body is wrapped in `try { ... } finally { end }`
 * (symbol-modules.ts), so an awaited continuation inside the same handler still counts: the
 * `finally` only runs once that continuation, not just the handler's first synchronous turn, completes.
 *
 * A callback-prop symbol gets this same wrap, so its own open/close tags its write loud
 * regardless of forwarding hops or module-load timing. Known gap: a callback prop a timer or
 * socket message calls through the identical capture-slot dispatch is counted loud too, since a
 * prop forwarded across a module boundary dispatches the same way despite being a direct click;
 * see goals/handoffs/async-final3.md for what was tried.
 */
export function marklessUserActionStart(context: UserActionContext): void {
	context.graph?.markUserActionStart?.();
}

export function marklessUserActionEnd(context: UserActionContext): void {
	context.graph?.markUserActionEnd?.();
}
