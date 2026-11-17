export async function loadPoints(): Promise<number[]> {
	await new Promise((done) => setTimeout(done, 20));
	return [1, 2, 3];
}

export function draw(el: HTMLElement, points: ReadonlyArray<number>): void {
	el.textContent = `drawn ${points.length} points`;
}
