// Runtime module ids whose presence in an action's runtime demand marks it as served by a lean dispatch path.
export const LEAN_DISPATCH_MARKER_MODULES = {
	scalar: ['web/fns/scalar-specialized', 'web/fns/scalar-served'],
	row: ['web/event-only-lean/row'],
} as const satisfies Record<string, readonly string[]>;
