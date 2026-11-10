let release: ((value: string) => void) | undefined;
let asked = false;
let gate = new Promise<string>((resolve) => (release = resolve));

export function waitForTitle(): Promise<string> {
	asked = true;
	return gate;
}

export function titleAsked(): boolean {
	return asked;
}

export function releaseTitle(value: string): void {
	release?.(value);
}

export function resetTitleGate(): void {
	asked = false;
	gate = new Promise<string>((resolve) => (release = resolve));
}
