// Answers inside the pending deadline, so the browser settles the boundary without showing @pending.
export function answerSoon<T>(value: T): Promise<T> {
	return new Promise((resolve) => setTimeout(() => resolve(value), 50));
}
