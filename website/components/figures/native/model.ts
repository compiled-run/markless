// The iOS proof's real view hierarchy (poc/fixtures/proofs/ios-native-rendering-target), and what the figure's search finds.
export const LAYERS = [
	{ key: 'window', name: 'UIWindow', what: 'the app window' },
	{ key: 'view', name: 'UIView', what: "the view controller's view" },
	{ key: 'stack', name: 'UIStackView', what: 'the <main> element' },
	{ key: 'label', name: 'UILabel', what: 'the <h1> element' },
	{ key: 'button', name: 'UIButton', what: 'the <button> element' },
] as const;

export const HEADING = 'Markless iOS Proof';
export const NOT_STARTED = ['Android', 'Windows', 'Linux'] as const;

export function search(query: string): string[] {
	const q = query.trim().toLowerCase();
	if (!q) return [];
	return LAYERS.filter((layer) => layer.name.toLowerCase().includes(q)).map((layer) => layer.name);
}

export const describeSearch = (query: string, found: string[]) =>
	query.trim() ? `${found.length} result${found.length === 1 ? '' : 's'} for ${query.trim()}${found.length ? ': ' + found.join(', ') : '. There is no web view in this app.'}` : '';

export const START_SAID = 'An iPhone running the early Markless proof: a native label and a native button. Press Debug View Hierarchy to look inside.';
export const EXPLODED = 'The screen came apart into its layers: UIWindow, UIView, UIStackView, UILabel and UIButton. No WKWebView anywhere.';
export const TAPPED = 'The UIButton was tapped. A JavaScript handler ran in JavaScriptCore, and the native button set its new title itself.';
