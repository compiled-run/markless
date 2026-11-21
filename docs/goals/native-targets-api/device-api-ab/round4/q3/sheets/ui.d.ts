// Module: @markless/ui (excerpt)
// Families of parts with behaviour (keyboard, focus, state) and no styles. The author styles them from a stylesheet: each
// part's element carries `ui-*` attributes (for example `ui-pressed`, `ui-selected`) to style against.
type Div = { class?: string; children?: unknown };
export declare const tabs: {
	// The tabs. Holds which tab shows (`value`; omit it and none shows) and how the arrow keys walk.
	root: (props: Div & { value?: string; orientation?: 'horizontal' | 'vertical'; loop?: boolean; selectOnFocus?: boolean; onChange?: (value: string) => void }) => Element;
	// The row of tabs (role="tablist").
	list: (props: Div) => Element;
	// One tab; label content only. It shows the content part with the same `value`.
	trigger: (props: Div & { value: string; disabled?: boolean }) => Element;
	// One panel. It stays in the page when its tab is not showing.
	content: (props: Div & { value: string }) => Element;
};
export declare const base: {
	// A button. Give it `pressed` and it is a toggle button that flips on each press and calls onChange with the new
	// state; leave `pressed` off and it is a plain button with no state of its own.
	button: (props: { disabled?: boolean; pressed?: boolean; onChange?: (pressed: boolean) => void; children?: unknown }) => Element;
	// A plain <label>.
	label: (props: { for?: string; children?: unknown }) => Element;
	// A display separator.
	separator: (props: { orientation?: 'horizontal' | 'vertical'; decorative?: boolean }) => Element;
	// Content hidden from sight but still read by screen readers.
	visuallyhidden: (props: { children?: unknown }) => Element;
};
