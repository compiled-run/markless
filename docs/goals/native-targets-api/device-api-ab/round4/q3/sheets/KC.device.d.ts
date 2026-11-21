// Module: @markless/device (excerpt)
export type Access = 'unknown' | 'granted' | 'denied';
// A photo; `url` works as an <img> src.
export interface Photo { url: string; width: number; height: number }
export interface Camera {
	// 'unknown' until the person answers the permission prompt.
	readonly access: Access;
	// False until its element is on screen and the camera is running.
	readonly ready: boolean;
	readonly facing: 'front' | 'back';
	// Switches between the front and back cameras.
	flip(): void;
	// Waits until ready, then takes a photo.
	takePhoto(): Promise<Photo>;
}
// A camera that belongs to this component: its fields are live, and it is released when the component leaves the page.
// Show it with its element (see below).
export declare function camera(options?: { facing?: 'front' | 'back' }): Camera;

// The camera element and the PDF element have no HTML equivalent. Each is one box with no parts and no behaviour of its
// own. The author sizes and places the box with `class`; what is inside it is drawn by the device and cannot be styled:
// on iPhone and Android, the system's own camera preview and PDF view; on the website, the browser's camera picture and
// the browser's PDF viewer.
// The camera element shows a camera made with camera(). The PDF element shows one page of a PDF: `page` counts from 1,
// and `onLoad` is called once with the page count.
type CameraElementProps = { el: Camera; class?: string };
type PdfElementProps = { src: string; page?: number; onLoad?: (info: { pages: number }) => void; class?: string };
// <CameraView el={cam} />   <PdfView src="…" />
export declare function CameraView(props: CameraElementProps): Element;
export declare function PdfView(props: PdfElementProps): Element;
