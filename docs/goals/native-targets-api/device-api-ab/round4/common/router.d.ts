// Module: @markless/router
// The app is built from one codebase as an iPhone app, an Android app and a website.
// An app is its `pages/` folder: `pages/index.tsrx` is `/`, `pages/orders.tsrx` is `/orders`, and
// `pages/orders/[id].tsrx` is `/orders/42` with `params.id === '42'`. Each page file default-exports its component.
// There are no layout files: a page renders everything on its screen.
// On iPhone and Android each route a person visits is a screen in the system's stack. A link pushes a new screen; the
// system Back (the back button, the edge swipe) pops it, and the screen below shows exactly as it was left.
// Each screen has its own state: it starts fresh when the screen is built and is kept while the screen is on the stack.
// Opening the app at a path from outside it (a link in another app, or a tapped push notification, whether or not the
// app was running) builds one screen for each leading part of the path that is a route, shortest first: `/orders/42`
// opens `/`, then `/orders`, then `/orders/42` on top, and Back walks up.
// A push notification carries a `path`, which the server sets when it sends it.
// On the website a link loads the page in place, and the browser's Back shows the previous page as the server sent it
// (its state starts over).

export interface PageProps<Params extends object = Record<string, string>> {
	readonly params: Readonly<Params>;
	readonly url: { readonly pathname: string; readonly search: string };
}
export interface NavigateOptions {
	// Put the new page in the current one's place instead of on top.
	readonly replace?: boolean;
}
// A link to a page of this app.
export declare function Link(props: { href: string; replace?: boolean; class?: string; children?: unknown }): Element;
// Goes to `path` exactly as a click on <Link href={path}> would.
export declare function navigate(path: string, options?: NavigateOptions): Promise<void>;
// The same as the person pressing Back.
export declare function back(): void;
// Code after a call to navigate() or back() in the same handler does not run.
