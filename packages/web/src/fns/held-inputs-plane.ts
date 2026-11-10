import { createHeldInputsPlane } from '@markless/runtime/graph-held';
import { asyncPlanes } from '../reconcile-plane-slot.ts';

export function installMarklessHeldInputs(): void {
	asyncPlanes.held = createHeldInputsPlane;
}
