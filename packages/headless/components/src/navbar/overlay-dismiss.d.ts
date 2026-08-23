// STOPGAP, and it does not belong here.
//
// The overlay primitive dispatches a `dismiss` CustomEvent on a marked element,
// which is the whole reason `onDismiss` is writable at all. The type service's
// element attribute map is built from `GlobalEventHandlersEventMap`
// (`packages/typescript-plugin/src/markless-tsrx.d.ts`), and the overlay landing
// never added `dismiss` to it, so `onDismiss` on any element is
// `TS2322: Property 'onDismiss' does not exist`.
//
// A component family declaring a framework event globally is the wrong home: the
// declaration leaks to every package that typechecks against this program, and
// the event is `@markless/web`'s, not the navbar's. It sits here only so this
// family can ship the adoption; it should move into the type service's own
// declaration file and be deleted from here.

declare global {
	interface GlobalEventHandlersEventMap {
		dismiss: CustomEvent<{ readonly reason: 'escape' | 'outside-press' }>;
	}
}

export {};
