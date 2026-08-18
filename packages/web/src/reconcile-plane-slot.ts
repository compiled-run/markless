type DerivedReconcilePlaneFactory = import('@markless/runtime').DerivedReconcilePlaneFactory;

// The reconcile plane is pay-per-use: only an app whose payload carries computed
// nodes emits `@markless/web/fns/reconcile-plane`, which fills this slot before
// the resume entry builds the graph. An app with no computeds never loads the
// plane module and its graph behaves exactly as it did before reconciliation.
let installedPlane: DerivedReconcilePlaneFactory | undefined;

export function installDerivedReconcilePlane(factory: DerivedReconcilePlaneFactory): void {
	installedPlane = factory;
}

export function derivedReconcilePlane(): DerivedReconcilePlaneFactory | undefined {
	return installedPlane;
}
