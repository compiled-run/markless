// Module: @markless/ui (excerpt: the modal family, a dialog)
// @markless/ui families are unstyled components that run on the website, iPhone and Android.
// <modal.root open={…} onChange={(open) => …}> holds whether the dialog shows. Inside it go an optional modal.trigger
// and modal.backdrop, which wraps modal.content; modal.title, modal.description and modal.close go inside the content.
// Omit `open` and the dialog starts closed; modal.trigger opens it and modal.close closes it. Escape and an outside
// press close it too (not with `alert`), and onChange is called with the new value whenever it opens or closes.
type Children = { class?: string; children?: unknown };
export declare const modal: {
	root: (props: { open?: boolean; alert?: boolean; onChange?: (open: boolean) => void; children?: unknown }) => Element;
	trigger: (props: Children & { onClick?: (event: MouseEvent) => void }) => Element;
	backdrop: (props: Children) => Element;
	content: (props: Children & { 'aria-label'?: string }) => Element;
	title: (props: Children) => Element;
	description: (props: Children) => Element;
	close: (props: Children & { onClick?: (event: MouseEvent) => void }) => Element;
};
