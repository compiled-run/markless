export function tones(input: { tone?: string; size?: string }): string {
	return `tone-${input.tone ?? 'plain'} size-${input.size ?? 'md'}`;
}
