export function mark(element: Element | undefined, value: string): void {
	element?.setAttribute('data-marked', value);
}

export const layout = { places: [{ y: 10 }, { y: 20 }, { y: 30 }] } as const;
