import { describeScene } from './scene-lib.ts';

export function SceneArm({ seed }: { seed: number }) @{
	<p data-scene>{describeScene(seed)}</p>
}
