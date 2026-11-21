import type { Camera } from '@markless/device';
// Module: @markless/ui (excerpt)
// Families of parts with behaviour (keyboard, focus, state) and no styles. The author styles them from a stylesheet: each
// part's element carries `ui-*` attributes (for example `ui-open`) to style against.
type Div = { class?: string; children?: unknown };
export declare const base: {
	// A button. Give it `pressed` and it is a toggle button that flips on each press and calls onChange with the new
	// state; leave `pressed` off and it is a plain button with no state of its own.
	button: (props: { disabled?: boolean; pressed?: boolean; onChange?: (pressed: boolean) => void; children?: unknown }) => Element;
};
// A panel that slides in from an edge and can be dragged closed (the bottom edge unless `orientation`/`start` say
// otherwise). Anatomy: <drawer.root> holds an optional drawer.trigger and drawer.backdrop, which wraps drawer.content;
// drawer.title, drawer.description and drawer.close go inside the content. Omit `open` and it starts closed;
// drawer.trigger opens it and drawer.close closes it. Every part is unstyled: the author draws all of it.
export declare const drawer: {
	root: (props: Div & { open?: boolean; onChange?: (open: boolean) => void; modal?: boolean; orientation?: 'horizontal' | 'vertical'; start?: boolean; snapPoints?: readonly number[] }) => Element;
	trigger: (props: Div & { onClick?: (event: MouseEvent) => void }) => Element;
	backdrop: (props: Div) => Element;
	content: (props: Div & { 'aria-label'?: string }) => Element;
	title: (props: Div) => Element;
	description: (props: Div) => Element;
	close: (props: Div & { onClick?: (event: MouseEvent) => void }) => Element;
};
