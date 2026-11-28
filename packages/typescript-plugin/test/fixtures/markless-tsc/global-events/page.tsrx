import { element, state } from '@markless/core';

export function Page() @{
	let open = state(true);
	let searching = state(false);
	let width = state(0);
	let menu = element<HTMLDivElement>();

	<>
		<dialog
			onDocumentKeyDown={(event) => {
				const key: string = event.key;
				const at: Document = event.currentTarget;
				if (key === 'Escape' && at.visibilityState === 'visible') open = false;
			}}
			onDocumentKeydown={(event) => event.repeat}
			onDocumentVisibilityChange={() => document.visibilityState}
			onWindowResize={(event) => {
				const what: Event = event;
				const at: Window = event.currentTarget;
				width = at.innerWidth + what.timeStamp;
			}}
			onWindowOnline={() => navigator.onLine}
			onWindowOffline={() => navigator.onLine}
			onWindowScroll={() => window.scrollY}
			onWindowPopState={(event) => event.state}
			onWindowStorage={(event) => event.key}
		>
			{open ? 'open' : 'closed'}
			{width}
		</dialog>
		<div
			el={menu}
			onDocumentPointerDown={(event) => {
				const id: number = event.pointerId;
				if (id >= 0 && !menu.contains(event.target as Node)) open = false;
			}}
			onDocumentKeyDown={(event) => {
				if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
					event.preventDefault();
					searching = true;
				}
			}}
		>
			{searching ? 'searching' : ''}
		</div>
	</>
}
