/** Writes the value it was given onto its element, so a test can see which input the behaviour last ran with. */
export const follow = (value: boolean | undefined) => (element: HTMLElement) => {
	element.setAttribute('data-follows', String(value));
};
