import type { Camera } from '@markless/device';
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

// The camera element and the PDF element have no HTML equivalent. Each is one box with no parts and no behaviour of its
// own. The author sizes and places the box with `class`; what is inside it is drawn by the device and cannot be styled:
// on iPhone and Android, the system's own camera preview and PDF view; on the website, the browser's camera picture and
// the browser's PDF viewer.
// The camera element shows a camera made with camera(). The PDF element shows one page of a PDF: `page` counts from 1,
// and `onLoad` is called once with the page count.
type CameraElementProps = { el: Camera; class?: string };
type PdfElementProps = { src: string; page?: number; onLoad?: (info: { pages: number }) => void; class?: string };
// <native.camera el={cam} />   <native.pdf src="…" />
export declare const native: {
	camera: (props: CameraElementProps) => Element;
	pdf: (props: PdfElementProps) => Element;
};
