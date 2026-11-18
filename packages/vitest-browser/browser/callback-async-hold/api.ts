// A save the test answers by hand, so the callback stays pending as long as the test needs.
let answer: (() => void) | undefined;

export function save(): Promise<void> {
	return new Promise((resolve) => (answer = resolve));
}

export function answerSave(): void {
	answer?.();
	answer = undefined;
}

export function saveIsPending(): boolean {
	return answer !== undefined;
}
