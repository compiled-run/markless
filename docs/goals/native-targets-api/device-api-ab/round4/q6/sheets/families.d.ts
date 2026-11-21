// Module: @markless/ui (excerpt)
// Families of parts with behaviour (keyboard, focus, state) and no styles. The author styles them from a stylesheet: each
// part's element carries `ui-*` attributes (for example `ui-open`) to style against.
type Div = { class?: string; children?: unknown };
// The modal family: a dialog. <modal.root> holds an optional modal.trigger and modal.backdrop, which wraps modal.content;
// modal.title, modal.description and modal.close go inside the content. `alert` makes it an alert dialog.
export declare const modal: {
	root: (props: Div & { open?: boolean; alert?: boolean; onChange?: (open: boolean) => void }) => Element;
	trigger: (props: Div & { onClick?: (event: MouseEvent) => void }) => Element;
	backdrop: (props: Div) => Element;
	content: (props: Div & { 'aria-label'?: string }) => Element;
	title: (props: Div) => Element;
	description: (props: Div) => Element;
	close: (props: Div & { onClick?: (event: MouseEvent) => void }) => Element;
};
// The drawer family: a panel that slides in from an edge and can be dragged closed (the bottom edge unless `orientation`/`start` say
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
// HTML: a plain <dialog> works as in the browser: render it with `open` to show it.
