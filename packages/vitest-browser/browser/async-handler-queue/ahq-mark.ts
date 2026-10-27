export function markCurrentTarget(event: Event): void {
	const element = event.currentTarget as HTMLElement | null;
	if (element) element.dataset.hit = element.dataset.name ?? '';
}
