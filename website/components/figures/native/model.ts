// The values the knitting-chart figure shows and the sentence its live region speaks.
export const KNITTED = ['iOS', 'macOS'] as const;
export const WAITING = ['Android', 'Windows', 'Linux'] as const;

export const describeKnit = (tapped: boolean) =>
	tapped
		? 'A tap on each swatch ran the same hand-written row of the chart: both the iOS and the macOS button now read Count 1. The Android, Windows and Linux needles are still empty.'
		: 'One hand-written chart drives two swatches, an iOS phone and a macOS laptop, each knitting a button that reads Count 0. Three needles for Android, Windows and Linux hold nothing yet.';
