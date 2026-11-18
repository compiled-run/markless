// Built into Markless (excerpt)
import type { Camera } from '@markless/device';
// The camera element and the PDF element have no HTML equivalent. Each is one box with no parts and no behaviour of its
// own. The author sizes and places the box with `class`; what is inside it is drawn by the device and cannot be styled:
// on iPhone and Android, the system's own camera preview and PDF view; on the website, the browser's camera picture and
// the browser's PDF viewer.
// The camera element shows a camera made with camera(). The PDF element shows one page of a PDF: `page` counts from 1,
// and `onLoad` is called once with the page count.
type CameraElementProps = { el: Camera; class?: string };
type PdfElementProps = { src: string; page?: number; onLoad?: (info: { pages: number }) => void; class?: string };
// Built into Markless: written like HTML elements, lowercase, with no import.
// <camera el={cam} />   <pdf src="…" />
declare global {
	namespace JSX {
		interface IntrinsicElements {
			camera: CameraElementProps;
			pdf: PdfElementProps;
		}
	}
}
export {};
