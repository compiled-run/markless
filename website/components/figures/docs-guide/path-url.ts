// A page file's path becoming its address, and its nav.ts entry becoming the sidebar link, the pager and the document head.
import { desk } from '../ink/sheets.ts';

export const NAV = ["{", "  title: 'State',", "  href: '/concepts/state',", "  icon: …,", "  description: '…',", "},"];

export function drawing() {
	const k = desk(680, [
		{ key: 'file', x: 0, y: 0, w: 11, h: 4.4, bar: 'editor', title: 'state.mdx', curl: false },
		{ key: 'page', x: 10.5, y: 4.8, w: 10.5, h: 5, bar: 'browser', title: '/concepts/state' },
		{ key: 'nav', x: 0, y: 6.4, w: 9.4, h: 7.3, bar: 'editor', title: 'nav.ts', curl: false },
	]);
	k.lay();
	k.row('file', 0.8, 2.6, 'website/pages/', 'dim');
	k.row('file', 0.8, 3.4, 'concepts/state.mdx', 'bold');
	k.row('page', 1, 3.2, 'State is a variable', 'big');
	k.row('page', 1, 4.1, 'the page watches', 'big');
	NAV.forEach((text, i) => k.row('nav', 0.8, 2.5 + i * 0.66, text, 'mono'));
	k.next();
	k.swipe('file', 0.8, k.col(0.8, 14), 3.4, 'show', 300);
	k.arrow(['file', 9.4, 3.2], ['page', 4.2, 0.2], 'draw', 600, -0.8, true);
	k.hand('page', 1, -0.6, 'THE PATH IS THE ADDRESS', 'show', 1300, 'hand desk-text');
	k.swipe('nav', k.col(0.8, 8), k.col(0.8, 24), 2.5 + 2 * 0.66, 'show', 2000);
	k.arrow(['nav', 9, 2.5 + 2 * 0.66 - 0.2], ['page', 1.2, 4.6], 'draw', 2300, 0.6, true);
	k.hand('nav', 0.8, 6.9, 'SIDEBAR, PAGER, HEAD', 'show', 3000);
	return k.build();
}
