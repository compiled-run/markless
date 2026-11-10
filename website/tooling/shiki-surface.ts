// Shared by the build's fence highlighter and the Code block's browser highlighter, so both paint alike.
import type { ThemeRegistration } from 'shiki/core';
import githubDark from 'shiki/themes/github-dark.mjs';

export const LIGHT_THEME = 'github-light';
export const DARK_THEME = 'markless-dark';

/** Each colour github-dark uses, as the site's own `--syntax-*` token that takes its role in dark mode. */
export const DARK_TOKEN_COLOURS: Readonly<Record<string, string>> = {
	'#f97583': 'var(--syntax-kw)',
	'#b392f0': 'var(--syntax-fn)',
	'#9ecbff': 'var(--syntax-str)',
	'#dbedff': 'var(--syntax-str)',
	'#79b8ff': 'var(--syntax-num)',
	'#85e89d': 'var(--syntax-tag)',
	'#ffab70': 'var(--syntax-var)',
	'#fdaeb7': 'var(--syntax-kw)',
	'#6a737d': 'var(--syntax-comment)',
	'#e1e4e8': 'var(--ink)',
	'#d1d5da': 'var(--ink)',
	'#24292e': 'var(--paper)',
	'#2f363d': 'var(--paper)',
};

function siteColour(colour: string | undefined): string | undefined {
	if (colour === undefined) return undefined;
	const site = DARK_TOKEN_COLOURS[colour.toLowerCase()];
	if (site === undefined) throw new Error(`github-dark colour ${colour} has no site syntax token`);
	return site;
}

/** github-dark's scopes painted in the site's own palette, so dark code reads in the page's warm accents. */
export const siteDarkTheme: ThemeRegistration = {
	name: DARK_THEME,
	displayName: 'Markless Dark',
	type: 'dark',
	fg: 'var(--ink)',
	bg: 'var(--code-surface)',
	colors: { 'editor.foreground': 'var(--ink)', 'editor.background': 'var(--code-surface)' },
	tokenColors: (githubDark.tokenColors ?? []).map((rule) => ({
		...rule,
		settings: {
			...rule.settings,
			foreground: siteColour(rule.settings.foreground),
		},
	})),
};

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
