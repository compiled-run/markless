// The photo gallery the Lazy chunks figure draws, and the network panel rows beside it.
export const PHOTOS = ['Hills', 'Bay', 'Oak'] as const;
export const FILES = { open: 'open-photo.js', share: 'share.js' } as const;

export type Ran = { readonly open: boolean; readonly share: boolean };

export function describeGallery(ran: Ran, shown: number, last: string): string {
	if (!last) return 'A photo gallery. Its click code, open-photo.js and share.js, was downloaded with the page and has not run.';
	if (last === 'share') return 'Share pressed: share.js ran now, from the copy downloaded with the page. Nothing new was downloaded.';
	return `Opened ${PHOTOS[shown]}: open-photo.js ran now, from the copy downloaded with the page.${ran.share ? '' : ' share.js is still downloaded and waiting.'} Nothing new was downloaded.`;
}
