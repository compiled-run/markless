// Builds the five Q3 sheets and reference solutions from one template, so they differ only in the system-screen spelling.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
const q3 = join(dirname(new URL(import.meta.url).pathname), '..', 'q3');
mkdirSync(join(q3, 'solutions'), { recursive: true });
const head = (rule) => `// Module: @markless/device
// Calling a feature in a component body makes an object that belongs to that component: its fields are live (the page
// updates when they change), handlers may use it, and it is released when the component leaves the page.
// ${rule}
// A refused permission is an Error whose name is 'NotAllowedError'.

export type Access = 'unknown' | 'granted' | 'denied';
// A photo; \`url\` works as an <img> src.
export interface Photo { url: string; width: number; height: number }
export interface ShareData { title?: string; text?: string; url?: string }

export interface Camera {
	// 'unknown' until the person answers the permission prompt, then 'granted' or 'denied'.
	readonly access: Access;
	// False until its element is on screen and the camera is running.
	readonly ready: boolean;
	// Waits until ready, then takes a photo from this camera.
	takePhoto(): Promise<Photo>;
}
`;
const C = {
	cam: `// The phone's own camera screen, for taking a new photo; resolves with the photo taken, or null if the person cancels.`,
	lib: `// The phone's photo library, for choosing a photo already on the phone; resolves with it, or null if the person cancels.`,
	set: `// This app's page in the phone's Settings.`,
	share: `// The system share panel; resolves when it closes.`,
};
const noun = (name) => ({
	sheet: head('A system screen is a noun you open from anywhere: `settings.open()`. It is not made in a component.') + `// The in-page camera; show it with <base.camera el={cam} />.
export declare function camera(options?: { facing?: 'front' | 'back' }): Camera;
${C.cam}
export declare const ${name}: { open(): Promise<Photo | null> };
${C.lib}
export declare const photoLibrary: { open(): Promise<Photo | null> };
${C.set}
export declare const settings: { open(): void };
${C.share}
export declare const sharesheet: { open(data: ShareData): Promise<void> };
`,
	imports: `camera, ${name}, photoLibrary, settings, sharesheet`,
	system: `${name}.open()`, choose: 'photoLibrary.open()', settings: 'settings.open()', share: 'sharesheet.open',
});
const fnRule = 'A system screen is opened by calling a function from anywhere; nothing is made in a component.';
const variants = {
	FD: {
		sheet: head(fnRule) + `export declare const camera: {
	// The in-page camera; show it with <base.camera el={cam} />.
	(options?: { facing?: 'front' | 'back' }): Camera;
	// Opens the phone's own camera screen, for taking a new photo; resolves with the photo taken, or null if the person
	// cancels. Makes no in-page camera.
	takePhoto(): Promise<Photo | null>;
};
// Opens the phone's photo library, for choosing a photo already on the phone; resolves with it, or null if the person cancels.
export declare function choosePhoto(): Promise<Photo | null>;
// Opens this app's page in the phone's Settings.
export declare function openSettings(): void;
// Opens the system share panel; resolves when it closes.
export declare function openShareSheet(data: ShareData): Promise<void>;
`,
		imports: 'camera, choosePhoto, openSettings, openShareSheet',
		system: 'camera.takePhoto()', choose: 'choosePhoto()', settings: 'openSettings()', share: 'openShareSheet',
	},
	TJ: noun('systemCamera'),
	NB: noun('cameraScreen'),
	RZ: noun('cameraApp'),
	WK: {
		sheet: head(fnRule) + `// The in-page camera; show it with <base.camera el={cam} />.
export declare function camera(options?: { facing?: 'front' | 'back' }): Camera;
// Opens the phone's own camera screen, for taking a new photo; resolves with the photo taken, or null if the person
// cancels. Makes no in-page camera.
export declare function takePhoto(): Promise<Photo | null>;
// Opens the phone's photo library, for choosing a photo already on the phone; resolves with it, or null if the person cancels.
export declare function choosePhoto(): Promise<Photo | null>;
// Opens this app's page in the phone's Settings.
export declare function openSettings(): void;
// Opens the system share panel; resolves when it closes.
export declare function openShareSheet(data: ShareData): Promise<void>;
`,
		imports: 'camera, choosePhoto, openSettings, openShareSheet, takePhoto',
		system: 'takePhoto()', choose: 'choosePhoto()', settings: 'openSettings()', share: 'openShareSheet',
	},
};
for (const [label, v] of Object.entries(variants)) {
	writeFileSync(join(q3, 'sheets', `${label}.d.ts`), v.sheet);
	writeFileSync(join(q3, 'solutions', `${label}.tsrx`), `// file: PhotoStudio.tsrx
import { state } from '@markless/core';
import { base } from '@markless/ui';
import { ${v.imports}, type Photo } from '@markless/device';

export default function PhotoStudio() @{
	const cam = camera();
	let last = state<Photo | null>(null);

	<main>
		@if (cam.access === 'denied') {
			<div>
				<p>Camera access is off.</p>
				<button onClick={() => ${v.settings}}>Open Settings</button>
			</div>
		} @else {
			<base.camera el={cam} />
		}
		<button disabled={!cam.ready} onClick={async () => { last = await cam.takePhoto(); }}>Shutter</button>
		<button onClick={async () => { last = (await ${v.system}) ?? last; }}>Use phone camera</button>
		<button onClick={async () => { last = (await ${v.choose}) ?? last; }}>Choose a photo</button>
		@if (last) {
			<img src={last.url} alt="Last photo" />
		}
		<button disabled={!last} onClick={() => { if (last) ${v.share}({ url: last.url }); }}>Share</button>
	</main>
}
`);
}
