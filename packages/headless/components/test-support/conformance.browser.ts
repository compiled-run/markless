import { render, renderSSR } from '@markless/vitest-browser';
import Accordion from '../src/accordion/scenarios/basic.tsrx';
import BaseParts from '../src/base/scenarios/basic.tsrx';
import ButtonGroup from '../src/buttongroup/scenarios/basic.tsrx';
import Calendar from '../src/calendar/scenarios/basic.tsrx';
import Carousel from '../src/carousel/scenarios/basic.tsrx';
import Checkbox from '../src/checkbox/scenarios/basic.tsrx';
import Checklist from '../src/checklist/scenarios/basic.tsrx';
import Collapsible from '../src/collapsible/scenarios/basic.tsrx';
import Colorpicker from '../src/colorpicker/scenarios/basic.tsrx';
import Crop from '../src/crop/scenarios/basic.tsrx';
import DateBox from '../src/datebox/scenarios/basic.tsrx';
import Editable from '../src/editable/scenarios/basic.tsrx';
import FileUpload from '../src/fileupload/scenarios/basic.tsrx';
import GridList from '../src/gridlist/scenarios/basic.tsrx';
import Hovercard from '../src/hovercard/scenarios/basic.tsrx';
import Ink from '../src/ink/scenarios/basic.tsrx';
import Menu from '../src/menu/scenarios/basic.tsrx';
import Menubar from '../src/menubar/scenarios/basic.tsrx';
import { Basic as Combobox } from '../src/combobox/scenarios/basic.tsrx';
import Drawer from '../src/drawer/scenarios/basic.tsrx';
import Modal from '../src/modal/scenarios/basic.tsrx';
import Navbar from '../src/navbar/scenarios/basic.tsrx';
import Numberbox from '../src/numberbox/scenarios/basic.tsrx';
import Otp from '../src/otp/scenarios/basic.tsrx';
import Pad from '../src/pad/scenarios/basic.tsrx';
import Pagination from '../src/pagination/scenarios/basic.tsrx';
import Popover from '../src/popover/scenarios/basic.tsrx';
import Progress from '../src/progress/scenarios/basic.tsrx';
import QrCode from '../src/qr-code/scenarios/basic.tsrx';
import { Basic as RadioGroup } from '../src/radio-group/scenarios/basic.tsrx';
import { Basic as Rating } from '../src/rating/scenarios/basic.tsrx';
import Resizable from '../src/resizable/scenarios/basic.tsrx';
import { Basic as Select } from '../src/select/scenarios/basic.tsrx';
import Slider from '../src/slider/scenarios/basic.tsrx';
import Tabs from '../src/tabs/scenarios/basic.tsrx';
import TagList from '../src/taglist/scenarios/basic.tsrx';
import Textbox from '../src/textbox/scenarios/basic.tsrx';
import TimeBox from '../src/timebox/scenarios/basic.tsrx';
import Toaster from '../src/toaster/scenarios/basic.tsrx';
import Toggle from '../src/toggle/scenarios/basic.tsrx';
import Toolbar from '../src/toolbar/scenarios/basic.tsrx';
import Tooltip from '../src/tooltip/scenarios/basic.tsrx';
import Tour from '../src/tour/scenarios/basic.tsrx';
import Tree from '../src/tree/scenarios/basic.tsrx';
import { describe, expect, test } from 'vitest';
import { runConformance, type FamilyDescriptor } from './conformance.ts';

// Every family's Basic scenario, held against the one shared battery in
// conformance.ts. The descriptors below are the only per-family code: what the
// scenario renders, what its root promises, and how its surface opens.
//
// The mounts are written out rather than passed by reference because the SSR
// harness rewrites the marker call site itself, and only accepts an argument
// that is an identifier imported from a separate `.tsrx` module. That is why the
// imports above are static and every SSR mount below is spelled in full.

const descriptors: readonly FamilyDescriptor[] = [
	{
		family: 'accordion',
		mount: { CSR: () => render(Accordion), SSR: () => renderSSR(Accordion) },
		root: 'root',
		parts: [
			'root',
			'shipping-item',
			'shipping-label',
			'shipping-trigger',
			'shipping-content',
			'returns-item',
			'returns-label',
			'returns-trigger',
			'returns-content',
			'sizing-item',
			'sizing-label',
			'sizing-trigger',
			'sizing-content',
		],
		rootAria: { role: null },
		openCycle: {
			trigger: 'shipping-trigger',
			surface: 'shipping-content',
			haspopup: null,
			ridesOverlay: false,
			focusLands: false,
			focusReturns: false,
		},
		// Each item writes the value it stands for into the markup, which is the
		// multi-valued case the naming spec keeps key-value.
		valuedAttributes: ['ui-value'],
		supportsDisabled: true,
	},
	{
		family: 'base',
		mount: { CSR: () => render(BaseParts), SSR: () => renderSSR(BaseParts) },
		root: 'base-parts',
		parts: ['base-parts', 'button', 'label', 'field', 'hidden'],
		// A bag of primitives rather than a family: no root part, so no root
		// contract to hold it to beyond the wrapper the scenario writes.
		rootAria: {},
		supportsDisabled: false,
	},
	{
		family: 'buttongroup',
		mount: { CSR: () => render(ButtonGroup), SSR: () => renderSSR(ButtonGroup) },
		root: 'root',
		parts: ['root', 'label', 'left', 'center', 'right'],
		rootAria: { role: 'group' },
		supportsDisabled: true,
	},
	{
		family: 'carousel',
		mount: { CSR: () => render(Carousel), SSR: () => renderSSR(Carousel) },
		root: 'root',
		parts: [
			'root',
			'title',
			'playtrigger',
			'scrollarea',
			'paris-item',
			'oslo-item',
			'lima-item',
			'backtrigger',
			'forwardtrigger',
		],
		rootAria: {
			role: 'group',
			'aria-roledescription': 'carousel',
			'aria-live': 'polite',
			'aria-atomic': 'false',
		},
		// The slide's own value, and which edge it settles against: both carry
		// information a consumer styles on, so both stay key-value.
		valuedAttributes: ['ui-value', 'ui-align'],
		supportsDisabled: false,
	},
	{
		family: 'checkbox',
		mount: { CSR: () => render(Checkbox), SSR: () => renderSSR(Checkbox) },
		root: 'root',
		parts: ['root', 'trigger', 'indicator', 'label'],
		rootAria: { role: null },
		supportsDisabled: true,
	},
	{
		family: 'checklist',
		mount: { CSR: () => render(Checklist), SSR: () => renderSSR(Checklist) },
		root: 'root',
		parts: [
			'root',
			'label',
			'selectall-trigger',
			'selectall-indicator',
			'lettuce',
			'lettuce-trigger',
			'lettuce-indicator',
			'lettuce-label',
			'tomato',
			'tomato-trigger',
			'tomato-indicator',
			'tomato-label',
			'mustard',
			'mustard-trigger',
			'mustard-indicator',
			'mustard-label',
		],
		rootAria: { role: 'group' },
		supportsDisabled: true,
	},
	{
		family: 'collapsible',
		mount: { CSR: () => render(Collapsible), SSR: () => renderSSR(Collapsible) },
		root: 'root',
		parts: ['root', 'trigger', 'content'],
		rootAria: { role: null },
		openCycle: {
			trigger: 'trigger',
			surface: 'content',
			haspopup: null,
			ridesOverlay: false,
			focusLands: false,
			focusReturns: false,
		},
		supportsDisabled: true,
	},
	{
		family: 'colorpicker',
		mount: { CSR: () => render(Colorpicker), SSR: () => renderSSR(Colorpicker) },
		root: 'root',
		// The Basic scenario is the inline picker; `trigger` only exists under
		// `popup`, so there is no openCycle here. The popup shape - open, focus in,
		// Escape back to the trigger, outside press - is held in
		// src/colorpicker/colorpicker.browser.ts, where a `popup` root is on the page.
		parts: [
			'root',
			'label',
			'content',
			'area',
			'area-thumb',
			'hue-track',
			'hue-thumb',
			'valuelabel',
			'field',
		],
		rootAria: { role: null },
		// Which channel a rail carries, which axis of the plane a control moves, and
		// the colour in force: each is information a consumer styles against.
		valuedAttributes: ['ui-channel', 'ui-axis', 'ui-value'],
		supportsDisabled: true,
	},
	{
		family: 'combobox',
		mount: { CSR: () => render(Combobox), SSR: () => renderSSR(Combobox) },
		root: 'root',
		parts: [
			'root',
			'label',
			'input',
			'trigger',
			'content',
			'apple',
			'apple-itemlabel',
			'apple-itemindicator',
			'banana',
			'banana-itemlabel',
			'banana-itemindicator',
			'cherry',
			'cherry-itemlabel',
			'cherry-itemindicator',
		],
		rootAria: { role: 'group' },
		openCycle: {
			trigger: 'trigger',
			surface: 'content',
			// The popup is declared on the input, which is the element carrying
			// role="combobox"; the show button beside it declares none.
			haspopup: null,
			ridesOverlay: true,
			// A combobox keeps focus on its input and points at the highlighted
			// option instead of moving into the list.
			focusLands: false,
			focusReturns: false,
		},
		// The family's note names this the one place an item's value appears in
		// the markup, so it is key-value by design.
		valuedAttributes: ['ui-value'],
		supportsDisabled: true,
	},
	{
		family: 'crop',
		mount: { CSR: () => render(Crop), SSR: () => renderSSR(Crop) },
		root: 'root',
		parts: [
			'root',
			'label',
			'description',
			'area',
			'selection',
			'handle-block-start',
			'handle-block-end',
			'handle-inline-start',
			'handle-inline-end',
			'handle-top-start',
			'handle-top-end',
			'handle-bottom-start',
			'handle-bottom-end',
			'field',
		],
		rootAria: { role: null },
		// No openCycle: the rectangle is a role="group" that is always on the page,
		// so the battery's click-a-trigger cycle has nothing of the family's own to
		// click. The selection and all eight handles are tab stops — that is how a
		// rectangle is moved and each edge resized without a pointer. The keys, the
		// drag and the live readout live in src/crop/crop.browser.ts.
		valuedAttributes: [],
		supportsDisabled: true,
	},
	{
		family: 'calendar',
		mount: { CSR: () => render(Calendar), SSR: () => renderSSR(Calendar) },
		root: 'root',
		// The Basic scenario is the inline month; `trigger` only exists under
		// `popup`, so there is no openCycle here. The popup shape - open, focus in,
		// Escape back to the trigger, outside press - is held in
		// src/calendar/calendar.browser.ts, where a `popup` root is on the page.
		parts: ['root', 'label', 'content', 'title', 'back', 'forward', 'field'],
		rootAria: { role: null },
		supportsDisabled: true,
	},
	{
		family: 'datebox',
		mount: { CSR: () => render(DateBox), SSR: () => renderSSR(DateBox) },
		root: 'root',
		parts: ['root', 'label', 'monthinput', 'dayinput', 'yearinput', 'field'],
		// The minted idref the group's name rides on is checked by `idrefs`, not
		// here: it has no fixed value to declare.
		rootAria: { role: 'group', 'aria-disabled': 'false' },
		// Which part of the date a box holds, and what it holds now: both carry
		// information a consumer styles on, so both stay key-value.
		valuedAttributes: ['ui-type', 'ui-value'],
		supportsDisabled: true,
	},
	{
		family: 'editable',
		mount: { CSR: () => render(Editable), SSR: () => renderSSR(Editable) },
		root: 'root',
		parts: ['root', 'label', 'trigger', 'input', 'field'],
		// Preview and edit are the same room, swapped by `hidden` on two elements
		// that are both always in the DOM. That is not an openCycle: there is no
		// surface a trigger reports through aria-expanded, and nothing to dismiss.
		rootAria: { role: 'group', 'aria-disabled': null },
		// The words themselves, which is the one thing about this family a
		// consumer styles against; every other mark here is presence.
		valuedAttributes: ['ui-value'],
		supportsDisabled: true,
	},
	{
		family: 'fileupload',
		mount: { CSR: () => render(FileUpload), SSR: () => renderSSR(FileUpload) },
		root: 'root',
		// The rows are not on the page until a file arrives, so only what the
		// scenario renders at rest is named here. There is no openCycle: nothing
		// this family owns opens, and the picker it does open is the operating
		// system's, outside the document entirely.
		parts: ['root', 'label', 'droparea', 'trigger', 'field', 'rows'],
		rootAria: { role: null },
		supportsDisabled: true,
	},
	{
		family: 'gridlist',
		mount: { CSR: () => render(GridList), SSR: () => renderSSR(GridList) },
		root: 'root',
		parts: [
			'root',
			'label',
			'readme-item',
			'readme-itemcontent',
			'readme-itemlabel',
			'license-item',
			'license-itemcontent',
			'license-itemlabel',
			'changelog-item',
			'changelog-itemcontent',
			'changelog-itemlabel',
		],
		// The minted idref the grid's name rides on is checked by `idrefs`, not
		// here: it has no fixed value to declare. The starter is not selectable, so
		// the grid declares no aria-multiselectable at all.
		rootAria: {
			role: 'grid',
			'aria-multiselectable': null,
			'aria-disabled': 'false',
		},
		// No openCycle: nothing here opens. The grid is one tab stop and the arrows
		// step between rows from there, which the family's own suite drives.
		//
		// The row's identity in the picked set, which every part inside a row is
		// keyed by; every other mark this family writes is presence.
		valuedAttributes: ['ui-value'],
		supportsDisabled: true,
	},
	{
		family: 'hovercard',
		mount: { CSR: () => render(Hovercard), SSR: () => renderSSR(Hovercard) },
		root: 'root',
		parts: ['root', 'trigger', 'content'],
		rootAria: { role: null },
		// No openCycle: the trigger is a link, and pressing it goes where it points
		// rather than opening anything. Hover and focus are the only ways in, and
		// both are timed — so the battery's click-to-open cycle would be asserting a
		// gesture this family deliberately refuses. The disclosure wiring, the
		// delays, Tab into the card and both dismissal paths live in
		// src/hovercard/hovercard.browser.ts.
		valuedAttributes: [],
		supportsDisabled: false,
	},
	{
		family: 'ink',
		mount: { CSR: () => render(Ink), SSR: () => renderSSR(Ink) },
		root: 'root',
		parts: ['root', 'label', 'description', 'area', 'field'],
		rootAria: { role: null },
		// No openCycle: the surface is a role="img" that is always on the page, so
		// the battery's click-a-trigger cycle has nothing of the family's own to
		// click. The area is still a tab stop — that is how undo and redo are
		// reached. The stroke and form rows live in src/ink/ink.browser.ts.
		valuedAttributes: [],
		supportsDisabled: true,
	},
	{
		family: 'menu',
		mount: { CSR: () => render(Menu), SSR: () => renderSSR(Menu) },
		root: 'root',
		// The Basic scenario is the trigger menu, so `contextarea` is not on the
		// page here; the right-click shape is held in src/menu/menu.browser.ts.
		// The surface is hidden rather than detached when closed, so its items are
		// present at rest.
		parts: ['root', 'trigger', 'content', 'item-cut', 'item-copy', 'item-paste', 'item-delete'],
		rootAria: { role: null },
		openCycle: {
			trigger: 'trigger',
			surface: 'content',
			haspopup: 'menu',
			ridesOverlay: true,
			focusLands: true,
			// Only Escape hands focus back; a press anywhere - the trigger included,
			// which reaches the surface as an outside press - is a person choosing
			// where to be, so the family deliberately leaves focus there. The Escape
			// return is held in src/menu/menu.browser.ts.
			focusReturns: false,
		},
		// Which way the surface settled is information a consumer styles against.
		valuedAttributes: [],
		supportsDisabled: true,
	},
	{
		family: 'menubar',
		mount: { CSR: () => render(Menubar), SSR: () => renderSSR(Menubar) },
		root: 'root',
		// Three whole menus stand inside the bar and each one's surface is hidden
		// rather than detached, so every panel and item below is on the page at rest.
		parts: [
			'root',
			'label',
			'bar-file',
			'panel-file',
			'item-new',
			'level-recent',
			'panel-recent',
			'item-draft',
			'item-notes',
			'bar-edit',
			'panel-edit',
			'item-undo',
			'item-redo',
			'bar-view',
			'panel-view',
			'item-wrap',
			'item-zoom',
		],
		rootAria: { role: 'menubar', 'aria-orientation': 'horizontal' },
		// No openCycle: a bar opens nothing of its own. What opens is each enclosed
		// menu, through that family's own trigger, and `menu` already holds that
		// cycle in its own descriptor. The bar's roving stop, its arrow walk and the
		// travel between open menus live in src/menubar/menubar.browser.ts.
		valuedAttributes: [],
		// The family takes no props at all, `disabled` included.
		supportsDisabled: false,
	},
	{
		family: 'drawer',
		mount: { CSR: () => render(Drawer), SSR: () => renderSSR(Drawer) },
		root: 'root',
		parts: ['root', 'trigger', 'backdrop', 'content', 'title', 'close'],
		rootAria: { role: null },
		valuedAttributes: ['ui-orientation'],
		openCycle: {
			trigger: 'trigger',
			surface: 'content',
			closeBy: 'close',
			haspopup: 'dialog',
			reportsExpanded: false,
			ridesOverlay: true,
			focusLands: true,
			focusReturns: true,
		},
		supportsDisabled: false,
	},
	{
		family: 'modal',
		mount: { CSR: () => render(Modal), SSR: () => renderSSR(Modal) },
		root: 'root',
		parts: ['root', 'trigger', 'backdrop', 'content', 'title', 'close'],
		rootAria: { role: null },
		openCycle: {
			trigger: 'trigger',
			surface: 'content',
			// The trigger only opens; the dialog's own close button shuts it.
			closeBy: 'close',
			haspopup: 'dialog',
			reportsExpanded: false,
			ridesOverlay: true,
			focusLands: true,
			focusReturns: true,
		},
		supportsDisabled: false,
	},
	{
		family: 'navbar',
		mount: { CSR: () => render(Navbar), SSR: () => renderSSR(Navbar) },
		root: 'root',
		parts: [
			'root',
			'home-item',
			'home-itemlink',
			'products-item',
			'products-itemtrigger',
			'products-itemcontent',
			'keyboards-itemlink',
			'mice-itemlink',
			'docs-item',
			'docs-itemtrigger',
			'docs-itemcontent',
			'start-itemlink',
			'api-itemlink',
		],
		rootAria: { role: null, 'aria-label': 'Primary' },
		openCycle: {
			trigger: 'products-itemtrigger',
			surface: 'products-itemcontent',
			haspopup: null,
			ridesOverlay: true,
			focusLands: false,
			focusReturns: false,
		},
		supportsDisabled: false,
	},
	{
		family: 'numberbox',
		mount: { CSR: () => render(Numberbox), SSR: () => renderSSR(Numberbox) },
		root: 'root',
		parts: ['root', 'label', 'backtrigger', 'input', 'forwardtrigger', 'valuelabel', 'field'],
		// One control with two buttons that are not tab stops: nothing for a group
		// role to group that the label does not already name.
		rootAria: { role: null },
		// The formatted number is what a consumer styles against, so it is
		// key-value by design rather than a presence mark.
		valuedAttributes: ['ui-value'],
		supportsDisabled: true,
	},
	{
		family: 'otp',
		mount: { CSR: () => render(Otp), SSR: () => renderSSR(Otp) },
		root: 'root',
		parts: [
			'root',
			'field',
			'item-0',
			'item-1',
			'item-2',
			'item-3',
			'item-4',
			'item-5',
			'indicator-0',
			'indicator-1',
			'indicator-2',
			'indicator-3',
			'indicator-4',
			'indicator-5',
		],
		rootAria: { role: null },
		supportsDisabled: true,
	},
	{
		family: 'pad',
		mount: { CSR: () => render(Pad), SSR: () => renderSSR(Pad) },
		root: 'root',
		parts: ['root', 'label', 'description', 'area', 'indicator', 'thumb', 'valuelabel', 'field'],
		rootAria: { role: null },
		// No openCycle: the field is a role="group" that is always on the page, so
		// the battery's click-a-trigger cycle has nothing of the family's own to
		// click. Every handle is its own tab stop and nothing roves - that is how a
		// second control point is reached. The keys, the gesture and the two-axis
		// announcement live in src/pad/pad.browser.ts.
		// The readout's text is what a consumer styles against, so it stays
		// key-value; every other mark this family writes is a presence attribute.
		valuedAttributes: ['ui-value'],
		supportsDisabled: true,
	},
	{
		family: 'pagination',
		mount: { CSR: () => render(Pagination), SSR: () => renderSSR(Pagination) },
		root: 'root',
		parts: [
			'root',
			'backtrigger',
			'item-1',
			'itemtrigger-1',
			'item-2',
			'itemtrigger-2',
			'item-3',
			'itemtrigger-3',
			'item-4',
			'itemtrigger-4',
			'item-5',
			'itemtrigger-5',
			'forwardtrigger',
		],
		rootAria: { role: null },
		supportsDisabled: true,
	},
	{
		family: 'popover',
		mount: { CSR: () => render(Popover), SSR: () => renderSSR(Popover) },
		root: 'root',
		parts: ['root', 'trigger', 'content', 'title', 'description', 'close'],
		rootAria: { role: null },
		openCycle: {
			trigger: 'trigger',
			surface: 'content',
			haspopup: 'dialog',
			ridesOverlay: true,
			// The surface is a dialog a person walks into, not one focus is put
			// into: the family moves focus only to hand it back on Escape.
			focusLands: false,
			focusReturns: false,
		},
		// Which edge the surface settles against is what a consumer styles on.
		valuedAttributes: [],
		supportsDisabled: false,
	},
	{
		family: 'progress',
		mount: { CSR: () => render(Progress), SSR: () => renderSSR(Progress) },
		root: 'root',
		parts: ['root', 'label', 'valuelabel', 'track', 'indicator'],
		rootAria: {
			role: 'progressbar',
			'aria-valuemin': '0',
			'aria-valuemax': '100',
			'aria-valuenow': '30',
		},
		// The bar's numbers are what a consumer styles against, so they are
		// key-value by design rather than presence marks.
		valuedAttributes: ['ui-progress', 'ui-value', 'ui-min', 'ui-max'],
		supportsDisabled: false,
	},
	{
		family: 'qr-code',
		mount: { CSR: () => render(QrCode), SSR: () => renderSSR(QrCode) },
		root: 'root',
		parts: ['root', 'frame', 'patternsvg', 'patternpath'],
		rootAria: { role: 'img', 'aria-label': 'Scan to open the site' },
		supportsDisabled: false,
	},
	{
		family: 'radio-group',
		mount: { CSR: () => render(RadioGroup), SSR: () => renderSSR(RadioGroup) },
		root: 'root',
		parts: [
			'root',
			'label',
			'monthly',
			'monthly-field',
			'monthly-trigger',
			'monthly-indicator',
			'monthly-label',
			'annual',
			'annual-field',
			'annual-trigger',
			'annual-indicator',
			'annual-label',
			'lifetime',
			'lifetime-field',
			'lifetime-trigger',
			'lifetime-indicator',
			'lifetime-label',
		],
		rootAria: { role: 'radiogroup' },
		supportsDisabled: true,
	},
	{
		family: 'rating',
		mount: { CSR: () => render(Rating), SSR: () => renderSSR(Rating) },
		root: 'root',
		// The five marks are one repeat under a single `star` testid, which is what
		// the family's own suite counts them by, so the wrapper is the part a
		// one-element-per-testid list can name.
		parts: ['root', 'label', 'stars', 'valuelabel'],
		rootAria: { role: 'radiogroup' },
		// How many marks there are and where the rating sits are numbers a consumer
		// styles against, so they are key-value by design rather than presence marks.
		valuedAttributes: ['ui-count', 'ui-value'],
		supportsDisabled: true,
	},
	{
		family: 'resizable',
		mount: { CSR: () => render(Resizable), SSR: () => renderSSR(Resizable) },
		root: 'root',
		parts: ['root', 'nav', 'thumb', 'main'],
		rootAria: { role: null },
		// No openCycle: nothing here opens. The divider is a focusable
		// role="separator" that moves a boundary, which the family's own suite drives.
		//
		// Which way the group runs, which panel a part speaks for, the share a panel
		// holds and the bounds the divider declares are all numbers and names a
		// consumer styles against, so they are key-value by design.
		valuedAttributes: ['ui-orientation', 'ui-value', 'ui-size', 'ui-min', 'ui-max'],
		supportsDisabled: true,
	},
	{
		family: 'select',
		mount: { CSR: () => render(Select), SSR: () => renderSSR(Select) },
		root: 'root',
		parts: [
			'root',
			'label',
			'trigger',
			'content',
			'apple',
			'apple-itemlabel',
			'apple-itemindicator',
			'banana',
			'banana-itemlabel',
			'banana-itemindicator',
			'cherry',
			'cherry-itemlabel',
			'cherry-itemindicator',
		],
		rootAria: { role: null },
		openCycle: {
			trigger: 'trigger',
			surface: 'content',
			haspopup: 'listbox',
			// This family owns its own dismissal handlers rather than carrying the
			// bare `overlay` mark, so the two dismissal rows do not apply to it.
			ridesOverlay: false,
			// The popup points at the highlighted option rather than requiring focus to move.
			focusLands: false,
			focusReturns: false,
		},
		supportsDisabled: true,
	},
	{
		family: 'slider',
		mount: { CSR: () => render(Slider), SSR: () => renderSSR(Slider) },
		root: 'root',
		parts: ['root', 'label', 'valuelabel', 'track', 'thumb'],
		// One thumb is the whole control, so the root takes no wrapper role.
		rootAria: { role: null },
		// The rail's numbers and which way it runs are what a consumer styles
		// against, so they are key-value by design rather than presence marks.
		valuedAttributes: ['ui-orientation', 'ui-value', 'ui-min', 'ui-max'],
		supportsDisabled: true,
	},
	{
		family: 'tabs',
		mount: { CSR: () => render(Tabs), SSR: () => renderSSR(Tabs) },
		root: 'root',
		parts: [
			'root',
			'list',
			'overview-trigger',
			'usage-trigger',
			'billing-trigger',
			'overview-content',
			'usage-content',
			'billing-content',
		],
		rootAria: { role: null },
		supportsDisabled: true,
	},
	{
		family: 'taglist',
		mount: { CSR: () => render(TagList), SSR: () => renderSSR(TagList) },
		root: 'root',
		// The chips are the consumer's own markup keyed by each tag's words, so
		// their testids carry a value and are not fixed part names; what is named
		// here is what the family itself puts on the page at rest.
		parts: ['root', 'label', 'input', 'field'],
		// No openCycle: the row has no surface, and the edit field a tag can open
		// is `hidden` in the same room rather than a thing a trigger expands.
		rootAria: { role: 'group', 'aria-disabled': null },
		// The tag's own words, which is the identity every part inside a chip is
		// keyed by; every other mark this family writes is presence.
		valuedAttributes: ['ui-value'],
		supportsDisabled: true,
	},
	{
		family: 'textbox',
		mount: { CSR: () => render(Textbox), SSR: () => renderSSR(Textbox) },
		root: 'root',
		parts: ['root', 'label', 'input'],
		rootAria: { role: null },
		supportsDisabled: true,
	},
	{
		family: 'timebox',
		mount: { CSR: () => render(TimeBox), SSR: () => renderSSR(TimeBox) },
		root: 'root',
		parts: ['root', 'label', 'hourinput', 'minuteinput', 'dayperiodinput', 'field'],
		// The minted idref the group's name rides on is checked by `idrefs`, not
		// here: it has no fixed value to declare.
		rootAria: { role: 'group', 'aria-disabled': 'false' },
		// No openCycle: nothing here opens. Every box is its own tab stop and an
		// arrow steps it, which the family's own suite drives.
		//
		// The order the locale writes its parts in, which part of the time a box
		// holds, and the digits it holds now are all values a consumer styles
		// against, so they are key-value by design.
		valuedAttributes: ['ui-order', 'ui-type', 'ui-value'],
		supportsDisabled: true,
	},
	{
		family: 'toaster',
		mount: { CSR: () => render(Toaster), SSR: () => renderSSR(Toaster) },
		root: 'root',
		// The region is in the DOM before the first message; the rows are not, so
		// only what the scenario renders at rest is named here.
		parts: ['root', 'rows', 'save', 'sticky', 'two', 'elsewhere'],
		rootAria: {
			role: null,
			'aria-live': 'polite',
			'aria-atomic': 'false',
			'aria-relevant': 'additions',
		},
		supportsDisabled: false,
	},
	{
		family: 'toggle',
		mount: { CSR: () => render(Toggle), SSR: () => renderSSR(Toggle) },
		root: 'root',
		parts: ['root', 'label', 'trigger', 'thumb'],
		rootAria: { role: null },
		supportsDisabled: true,
	},
	{
		family: 'toolbar',
		mount: { CSR: () => render(Toolbar), SSR: () => renderSSR(Toolbar) },
		root: 'root',
		parts: ['root', 'label', 'copy', 'cut', 'paste'],
		rootAria: { role: 'toolbar', 'aria-orientation': 'horizontal' },
		// No openCycle: a toolbar opens nothing of its own. It groups controls that
		// keep their own roles and collapses their tab stops into one, so the
		// battery's click-a-trigger cycle has no part of this family's to click. The
		// roving stop, the arrow walk and the foreign-control registration live in
		// src/toolbar/toolbar.browser.ts.
		valuedAttributes: [],
		supportsDisabled: true,
	},
	{
		family: 'tooltip',
		mount: { CSR: () => render(Tooltip), SSR: () => renderSSR(Tooltip) },
		root: 'root',
		parts: ['root', 'trigger', 'content'],
		rootAria: { role: null },
		// No openCycle: a tooltip's trigger is described by the tip, it does not
		// activate it. Hover and focus are the only ways in, and clicking the
		// trigger of a showing tip closes it rather than toggling — so the battery's
		// click-to-open cycle would be testing a gesture this family refuses. The
		// dismissal, hover and focus rows live in src/tooltip/tooltip.browser.ts.
		valuedAttributes: [],
		supportsDisabled: false,
	},
	{
		family: 'tour',
		mount: { CSR: () => render(Tour), SSR: () => renderSSR(Tour) },
		root: 'root',
		parts: [
			'root',
			'backdrop',
			'step-save',
			'save-title',
			'save-description',
			'save-count',
			'save-back',
			'save-forward',
			'save-close',
			'step-share',
			'share-title',
			'share-description',
			'share-count',
			'share-back',
			'share-forward',
			'share-close',
			'step-trash',
			'trash-title',
			'trash-description',
			'trash-count',
			'trash-back',
			'trash-forward',
			'trash-close',
		],
		rootAria: { role: null },
		// No openCycle: this family ships no trigger part. A tour is opened by the
		// consumer flipping `open`, so the battery's click-a-part cycle has nothing
		// of the family's own to click. The open, dismissal and step rows live in
		// src/tour/tour.browser.ts.
		valuedAttributes: ['ui-max', 'ui-value'],
		supportsDisabled: true,
	},
	{
		family: 'tree',
		mount: { CSR: () => render(Tree), SSR: () => renderSSR(Tree) },
		root: 'root',
		parts: [
			'root',
			'label',
			'readme-item',
			'readme-itemlabel',
			'license-item',
			'license-itemlabel',
			'changelog-item',
			'changelog-itemlabel',
		],
		rootAria: { role: 'tree', 'aria-label': 'Project files' },
		supportsDisabled: true,
	},
];

for (const descriptor of descriptors) runConformance(descriptor);

// axe grants the bar its `aria-required-children` only because it flattens the
// roleless, unnamed wrapper each enclosed menu renders, so the triggers inside
// count as the bar's own items. An accessible name on one of those wrappers -
// `aria-label` on a `menu.root` is the easy way - exposes it as a named generic,
// the bar loses every child, and the axe row above goes red far from the cause.
// The gallery's own copy of this shape is held in apps/sr-gallery/scripts/boot-check.ts.
describe('menubar wrappers', () => {
	for (const [mode, mount] of [
		['CSR', () => render(Menubar)],
		['SSR', () => renderSSR(Menubar)],
	] as const) {
		test(`${mode}: nothing between the bar and its items carries a name or a role`, async () => {
			const { container } = await mount();
			if (!(container instanceof Element)) {
				throw new Error('The mount did not hand back a real DOM container.');
			}

			const bar = container.querySelector('[role="menubar"]');
			expect(bar, 'the scenario renders a role="menubar"').not.toBeNull();
			if (!bar) return;

			// The bar's own items open menus and sit outside every surface; commands inside a surface do not count.
			const items = bar.querySelectorAll('[role="menuitem"][aria-haspopup="menu"]:not([role="menu"] *)');
			expect(items.length, 'one menuitem per menubar.item').toBe(3);

			for (const item of items) {
				const where = `between the bar and "${item.textContent}"`;
				for (
					let wrapper = item.parentElement;
					wrapper !== null && wrapper !== bar;
					wrapper = wrapper.parentElement
				) {
					expect(wrapper.getAttribute('aria-label'), `aria-label ${where}`).toBe(null);
					expect(wrapper.getAttribute('aria-labelledby'), `aria-labelledby ${where}`).toBe(null);
					expect(wrapper.getAttribute('role'), `role ${where}`).toBe(null);
				}
			}
		});
	}
});
