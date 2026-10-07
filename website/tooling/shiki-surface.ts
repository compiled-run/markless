// Shared by the build's fence highlighter and the Code block's browser highlighter, so both paint alike.

export const LIGHT_THEME = 'github-light';
export const DARK_THEME = 'github-dark';

/**
 * Drops both themes' own surface colours so the block sits on the site's own
 * ground rather than on a theme's slab: the `<pre>` loses its inline style, and
 * every span painted a theme's default foreground is repainted with the page's
 * ink, in that theme's channel. Token colours are left exactly as the themes
 * chose them.
 */
export function useSiteSurface(
	html: string,
	lightForeground: string,
	darkForeground: string,
): string {
	// Shiki writes hex in the theme's own casing, which is not the casing the
	// theme object reports, so both replacements match without regard to case.
	const hex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return html
		.replace(/(<pre class="shiki[^"]*")\s+style="[^"]*"/, '$1')
		.replace(new RegExp(`(?<!-)color:${hex(lightForeground)}`, 'gi'), 'color:var(--ink)')
		.replace(
			new RegExp(`--shiki-dark:${hex(darkForeground)}`, 'gi'),
			'--shiki-dark:var(--ink)',
		);
}
