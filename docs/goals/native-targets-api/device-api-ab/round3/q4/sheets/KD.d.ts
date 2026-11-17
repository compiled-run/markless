// Module: @markless/device
export type Access = 'unknown' | 'granted' | 'denied';
export interface Position { latitude: number; longitude: number; accuracy: number }
// The person's live position; \`position\` is null until the first reading.
export declare function location(): { readonly access: Access; readonly position: Position | null };
// The connection; \`online\` is false while the device has no connection.
export declare function network(): { readonly online: boolean };
export declare const notifications: {
	// Schedules a local notification; tapping it opens \`url\` in the app.
	schedule(options: { title: string; body?: string; at: Date; url: string }): Promise<void>;
};
export declare const settings: {
	// Opens this app's page in the phone's Settings.
	open(): void;
};
export declare const share: {
	// Opens the system share panel; resolves when it closes.
	open(data: { title?: string; text?: string; url?: string }): Promise<void>;
};
