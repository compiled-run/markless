// Module: @markless/device
// This is the part of the sheet about the in-page camera. The rest of the package is not shown.
// A refused permission is an Error whose name is 'NotAllowedError'. Nothing is declared in app config.

export type Facing = 'front' | 'back';

// A photo; `url` works as an <img> src.
export interface Photo { url: string; width: number; height: number }


export interface Camera {
	// False until its element is on screen and the camera is running.
	readonly ready: boolean;
	// True when camera access is refused.
	readonly denied: boolean;
	// Assign to flip.
	facing: Facing;
	// Waits until ready, then takes a photo.
	capture(): Promise<Photo>;
}
// The in-page camera. Call it in a component body: the object belongs to that component, its fields are live,
// handlers may use it, and it is released when the component leaves the page.
export function camera(options?: { facing?: Facing }): Camera;

declare global {
	interface HTMLElementTagNameMap {
		// Shows a camera made in this component: <camera el={cam} />.
		camera: Camera;
	}
}
