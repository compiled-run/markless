// The sidebar's own events: public/navbar.js sends them before and after an in-place navigation.
interface GlobalEventHandlersEventMap {
	sidebarleave: CustomEvent;
	sidebararrive: CustomEvent;
}
