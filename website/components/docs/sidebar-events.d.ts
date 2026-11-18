// The sidebar's own events: public/navbar.js sends them before and after an in-place navigation.
interface GlobalEventHandlersEventMap {
	// detail: the token of the section the reader is leaving, read before the next page shows.
	sidebarleave: CustomEvent<string>;
	sidebararrive: CustomEvent;
}
