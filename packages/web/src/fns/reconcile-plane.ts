import { createDerivedReconcilePlane } from '@markless/runtime/graph-reconcile';

import { installDerivedReconcilePlane } from '../reconcile-plane-slot.ts';

/**
 * Installs derived reconciliation for this app. The bundler emits a call to it
 * at the top of the generated resume module when, and only when, the app's
 * payload carries computed nodes, so the plane is in place before the resume
 * entry creates the graph and a computed-free app never ships this module.
 */
export function installMarklessDerivedReconcile(): void {
	installDerivedReconcilePlane(createDerivedReconcilePlane);
}
