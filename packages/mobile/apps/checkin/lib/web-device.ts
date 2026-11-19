// The browser's own APIs for what @markless/device does on a phone.

export type Place = { readonly latitude: number; readonly longitude: number };

export function browserPosition(): Promise<Place> {
	return new Promise((resolve, reject) =>
		navigator.geolocation.getCurrentPosition(
			(position) =>
				resolve({
					latitude: position.coords.latitude,
					longitude: position.coords.longitude,
				}),
			(error) =>
				reject(
					Object.assign(new Error(error.message), {
						name:
							error.code === error.PERMISSION_DENIED
								? 'NotAllowedError'
								: 'PositionUnavailableError',
					}),
				),
			{ timeout: 10_000 },
		),
	);
}

export async function uploadPhoto(file: File): Promise<string> {
	const response = await fetch('/api/photos', {
		method: 'POST',
		headers: { 'content-type': file.type || 'application/octet-stream' },
		body: file,
	});
	if (!response.ok) throw new Error(await response.text());
	return ((await response.json()) as { url: string }).url;
}

export async function shareLink(title: string, url: string): Promise<'shared' | 'copied'> {
	if (typeof navigator.share === 'function') {
		await navigator.share({ title, url });
		return 'shared';
	}
	await navigator.clipboard.writeText(url);
	return 'copied';
}

export async function permissionState(name: 'geolocation' | 'camera'): Promise<string> {
	if (import.meta.env.SSR) return 'unknown';
	try {
		return (await navigator.permissions.query({ name: name as PermissionName })).state;
	} catch {
		return 'unknown';
	}
}
