import { parentCommands } from './process-ancestry.ts';

export function detectAgent(): string | undefined {
	return parentCommands().find((command) => command.includes('claude'));
}
