// Carries a projection's place through the served render until `{children}` claims it.
export const PROJECTION_MARK_PREFIX = '<!--markless-projection:';
export const PROJECTION_MARK_PATTERN = /<!--markless-projection:(\d+)-->/g;

// Markup only when the value IS the served projection in this instance's own props; any other value is text.
export function marklessProjectionHtml(
	value: unknown,
	ownProps: unknown,
	path: ReadonlyArray<string>,
	text: (value: unknown) => string,
): string {
	let own = ownProps;
	for (const key of path) own = (own as Record<string, unknown> | null | undefined)?.[key];
	return typeof value === 'string' && value === own
		? value.replace(PROJECTION_MARK_PATTERN, '')
		: text(value);
}
