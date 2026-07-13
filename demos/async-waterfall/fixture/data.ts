export const LEVELS = 10;
export const DELAY_MS = 16;

export async function settleLevel(level: number, version: number): Promise<{ level: number; version: number; value: string }> {
	await new Promise<void>((resolve) => setTimeout(resolve, DELAY_MS));
	return { level, version, value: 'L' + level + ':v' + version };
}
