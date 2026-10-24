// Plain data the way a drawing tool writes it: what the page shows once and the slices its handlers read.
export const art = {
	views: [
		{ key: 'wide', width: 640, ink: 'M0 0 L640 0 SERVED-ONLY-WIDE' },
		{ key: 'tall', width: 320, ink: 'M0 0 L0 640 SERVED-ONLY-TALL' },
	],
	caption: 'SERVED-ONLY-CAPTION',
	labels: { star: 'Star added', dot: 'Dot added' },
	beats: ['rest', 'press', 'lift'],
};
