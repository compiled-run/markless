const photos = new Map<string, { readonly type: string; readonly bytes: ArrayBuffer }>();

export function keepPhoto(type: string, bytes: ArrayBuffer): string {
	const id = String(photos.size + 1);
	photos.set(id, { type, bytes });
	return id;
}

export function photo(id: string) {
	return photos.get(id);
}
