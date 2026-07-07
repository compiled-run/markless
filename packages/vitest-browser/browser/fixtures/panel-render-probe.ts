// Counts arm renders for the tier-3 proof: the probe expression runs every
// time the @try content renders (SSR serve or arm re-render module), so a
// menu toggle that leaves the count unchanged proves the flip stayed inside
// the branch range instead of re-rendering the whole arm.
let panelRenders = 0;

export function bumpPanelRenders(): number {
	panelRenders += 1;
	return panelRenders;
}

export function resetPanelRenders(): void {
	panelRenders = 0;
}
