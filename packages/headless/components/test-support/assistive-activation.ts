/**
 * The events Chromium dispatches when a screen reader activates an element
 * (NVDA's Enter in browse mode, VoiceOver's VO-Space): pointerdown and mousedown,
 * pointerup and mouseup, then a click, all at the element's centre, every pointer
 * event saying `mouse` and the click counting one. Blink builds them in
 * `EventDispatcher::DispatchSimulatedClick` for `kFromAccessibility`, so nothing
 * on them tells this activation from a person clicking with a mouse.
 */
export function assistiveActivate(target: Element): void {
	const box = target.getBoundingClientRect();
	const at = {
		bubbles: true,
		cancelable: true,
		composed: true,
		clientX: box.x + box.width / 2,
		clientY: box.y + box.height / 2,
		button: 0,
	};
	const pointer = { ...at, pointerId: 1, pointerType: 'mouse', isPrimary: true };
	target.dispatchEvent(new PointerEvent('pointerdown', { ...pointer, buttons: 1 }));
	target.dispatchEvent(new MouseEvent('mousedown', { ...at, buttons: 1, detail: 1 }));
	target.dispatchEvent(new PointerEvent('pointerup', pointer));
	target.dispatchEvent(new MouseEvent('mouseup', { ...at, detail: 1 }));
	target.dispatchEvent(new PointerEvent('click', { ...pointer, detail: 1 }));
}
