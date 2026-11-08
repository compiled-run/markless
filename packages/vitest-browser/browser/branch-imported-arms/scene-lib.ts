let sceneRuns = 0;

export function describeScene(seed: number): string {
	sceneRuns += 1;
	return `scene-${seed * 7}`;
}

export function readSceneRuns(): number {
	return sceneRuns;
}
