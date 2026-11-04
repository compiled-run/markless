// Written by tooling/ui-parts.test.ts from the @markless/ui source and SPEC.md. Refresh with -u.
import type { PartFacts } from './types.ts';

export const parts: Readonly<Record<string, readonly PartFacts[]>> = {
	"accordion": [
		{
			"part": "root",
			"role": "root",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-disabled",
				"ui-multiple"
			]
		},
		{
			"part": "item",
			"role": "item",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-closed",
				"ui-disabled",
				"ui-open",
				"ui-value"
			]
		},
		{
			"part": "itemlabel",
			"role": "label",
			"element": "h3",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "itemtrigger",
			"role": "trigger",
			"element": "button",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-closed",
				"ui-open"
			]
		},
		{
			"part": "itemcontent",
			"role": "content",
			"element": "div",
			"ariaRole": "region",
			"hidden": false,
			"hooks": [
				"ui-closed",
				"ui-open"
			]
		}
	],
	"base": [
		{
			"part": "button",
			"role": "",
			"element": "button",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-pressed"
			]
		},
		{
			"part": "label",
			"role": "label",
			"element": "label",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "separator",
			"role": "",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-decorative",
				"ui-orientation",
				"ui-separator"
			]
		},
		{
			"part": "visuallyhidden",
			"role": "",
			"element": "span",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		}
	],
	"buttongroup": [
		{
			"part": "root",
			"role": "root",
			"element": "div",
			"ariaRole": "group",
			"hidden": false,
			"hooks": [
				"ui-disabled",
				"ui-multiple",
				"ui-required",
				"ui-vertical"
			]
		},
		{
			"part": "item",
			"role": "item",
			"element": "button",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-disabled",
				"ui-pressed",
				"ui-vertical"
			]
		},
		{
			"part": "itemfield",
			"role": "field",
			"element": "input",
			"ariaRole": "",
			"hidden": true,
			"hooks": []
		},
		{
			"part": "label",
			"role": "label",
			"element": "label",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		}
	],
	"calendar": [
		{
			"part": "root",
			"role": "root",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-closed",
				"ui-disabled",
				"ui-invalid",
				"ui-multiple",
				"ui-open",
				"ui-popup",
				"ui-range",
				"ui-readonly",
				"ui-required"
			]
		},
		{
			"part": "backtrigger",
			"role": "trigger",
			"element": "button",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "content",
			"role": "content",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-closed",
				"ui-open"
			]
		},
		{
			"part": "description",
			"role": "description",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "error",
			"role": "error",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "field",
			"role": "field",
			"element": "input",
			"ariaRole": "",
			"hidden": true,
			"hooks": []
		},
		{
			"part": "forwardtrigger",
			"role": "trigger",
			"element": "button",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "item",
			"role": "item",
			"element": "button",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-disabled",
				"ui-inrange",
				"ui-outside",
				"ui-rangeend",
				"ui-rangestart",
				"ui-selected",
				"ui-today",
				"ui-unavailable"
			]
		},
		{
			"part": "label",
			"role": "label",
			"element": "label",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-disabled"
			]
		},
		{
			"part": "title",
			"role": "title",
			"element": "h2",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "trigger",
			"role": "trigger",
			"element": "button",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-closed",
				"ui-open"
			]
		}
	],
	"carousel": [
		{
			"part": "root",
			"role": "root",
			"element": "div",
			"ariaRole": "group",
			"hidden": false,
			"hooks": [
				"ui-loop",
				"ui-reduced-motion",
				"ui-vertical"
			]
		},
		{
			"part": "title",
			"role": "title",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "scrollarea",
			"role": "area",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-align",
				"ui-draggable",
				"ui-track",
				"ui-vertical"
			]
		},
		{
			"part": "item",
			"role": "item",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-active",
				"ui-value"
			]
		},
		{
			"part": "backtrigger",
			"role": "trigger",
			"element": "button",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "forwardtrigger",
			"role": "trigger",
			"element": "button",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "navlist",
			"role": "",
			"element": "div",
			"ariaRole": "tablist",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "navtrigger",
			"role": "trigger",
			"element": "button",
			"ariaRole": "tab",
			"hidden": false,
			"hooks": [
				"ui-active",
				"ui-value"
			]
		},
		{
			"part": "playtrigger",
			"role": "trigger",
			"element": "button",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-reduced-motion"
			]
		}
	],
	"checkbox": [
		{
			"part": "root",
			"role": "root",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-checked",
				"ui-disabled",
				"ui-mixed"
			]
		},
		{
			"part": "trigger",
			"role": "trigger",
			"element": "button",
			"ariaRole": "checkbox",
			"hidden": false,
			"hooks": [
				"ui-checked",
				"ui-disabled",
				"ui-mixed"
			]
		},
		{
			"part": "indicator",
			"role": "indicator",
			"element": "span",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "label",
			"role": "label",
			"element": "label",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "description",
			"role": "description",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "error",
			"role": "error",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "field",
			"role": "field",
			"element": "input",
			"ariaRole": "",
			"hidden": true,
			"hooks": []
		}
	],
	"checklist": [
		{
			"part": "root",
			"role": "root",
			"element": "div",
			"ariaRole": "group",
			"hidden": false,
			"hooks": [
				"ui-checked",
				"ui-disabled",
				"ui-mixed"
			]
		},
		{
			"part": "label",
			"role": "label",
			"element": "label",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "selectall",
			"role": "",
			"element": "button",
			"ariaRole": "checkbox",
			"hidden": false,
			"hooks": [
				"ui-checked",
				"ui-disabled",
				"ui-mixed"
			]
		},
		{
			"part": "selectallindicator",
			"role": "indicator",
			"element": "span",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "item",
			"role": "item",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-checked",
				"ui-disabled",
				"ui-mixed"
			]
		},
		{
			"part": "itemtrigger",
			"role": "trigger",
			"element": "button",
			"ariaRole": "checkbox",
			"hidden": false,
			"hooks": [
				"ui-checked",
				"ui-disabled",
				"ui-mixed"
			]
		},
		{
			"part": "itemindicator",
			"role": "indicator",
			"element": "span",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "itemlabel",
			"role": "label",
			"element": "label",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "itemdescription",
			"role": "description",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "error",
			"role": "error",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "field",
			"role": "field",
			"element": "input",
			"ariaRole": "",
			"hidden": true,
			"hooks": []
		}
	],
	"collapsible": [
		{
			"part": "root",
			"role": "root",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-closed",
				"ui-disabled",
				"ui-open"
			]
		},
		{
			"part": "trigger",
			"role": "trigger",
			"element": "button",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-closed",
				"ui-open"
			]
		},
		{
			"part": "content",
			"role": "content",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-closed",
				"ui-open"
			]
		}
	],
	"colorpicker": [
		{
			"part": "root",
			"role": "root",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-alpha",
				"ui-closed",
				"ui-disabled",
				"ui-dragging",
				"ui-invalid",
				"ui-open",
				"ui-picker",
				"ui-popup",
				"ui-readonly",
				"ui-required"
			]
		},
		{
			"part": "area",
			"role": "area",
			"element": "div",
			"ariaRole": "group",
			"hidden": false,
			"hooks": [
				"ui-disabled",
				"ui-dragging",
				"ui-plane",
				"ui-readonly"
			]
		},
		{
			"part": "content",
			"role": "content",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-closed",
				"ui-open",
				"ui-popup"
			]
		},
		{
			"part": "description",
			"role": "description",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "error",
			"role": "error",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "field",
			"role": "field",
			"element": "input",
			"ariaRole": "",
			"hidden": true,
			"hooks": []
		},
		{
			"part": "input",
			"role": "input",
			"element": "input",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-channel"
			]
		},
		{
			"part": "item",
			"role": "item",
			"element": "button",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-selected",
				"ui-value"
			]
		},
		{
			"part": "label",
			"role": "label",
			"element": "label",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-disabled"
			]
		},
		{
			"part": "thumb",
			"role": "thumb",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-channel",
				"ui-disabled",
				"ui-dragging"
			]
		},
		{
			"part": "track",
			"role": "track",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-channel",
				"ui-disabled",
				"ui-dragging",
				"ui-rail",
				"ui-readonly"
			]
		},
		{
			"part": "trigger",
			"role": "trigger",
			"element": "button",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-closed",
				"ui-open"
			]
		},
		{
			"part": "valuelabel",
			"role": "label",
			"element": "output",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-disabled",
				"ui-value"
			]
		}
	],
	"combobox": [
		{
			"part": "root",
			"role": "root",
			"element": "div",
			"ariaRole": "group",
			"hidden": false,
			"hooks": [
				"ui-closed",
				"ui-disabled",
				"ui-inline",
				"ui-open",
				"ui-required"
			]
		},
		{
			"part": "label",
			"role": "label",
			"element": "label",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "input",
			"role": "input",
			"element": "input",
			"ariaRole": "combobox",
			"hidden": false,
			"hooks": [
				"ui-closed",
				"ui-open"
			]
		},
		{
			"part": "trigger",
			"role": "trigger",
			"element": "button",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-closed",
				"ui-open"
			]
		},
		{
			"part": "content",
			"role": "content",
			"element": "div",
			"ariaRole": "listbox",
			"hidden": false,
			"hooks": [
				"ui-closed",
				"ui-open"
			]
		},
		{
			"part": "item",
			"role": "item",
			"element": "div",
			"ariaRole": "option",
			"hidden": false,
			"hooks": [
				"ui-disabled",
				"ui-highlighted",
				"ui-selected",
				"ui-value"
			]
		},
		{
			"part": "itemlabel",
			"role": "label",
			"element": "span",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "itemindicator",
			"role": "indicator",
			"element": "span",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-hidden"
			]
		},
		{
			"part": "description",
			"role": "description",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "error",
			"role": "error",
			"element": "div",
			"ariaRole": "alert",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "field",
			"role": "field",
			"element": "select",
			"ariaRole": "",
			"hidden": true,
			"hooks": []
		}
	],
	"crop": [
		{
			"part": "root",
			"role": "root",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-disabled",
				"ui-dragging",
				"ui-fixed",
				"ui-resizing"
			]
		},
		{
			"part": "area",
			"role": "area",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-area",
				"ui-disabled",
				"ui-dragging",
				"ui-fixed",
				"ui-resizing"
			]
		},
		{
			"part": "description",
			"role": "description",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "error",
			"role": "error",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "field",
			"role": "field",
			"element": "input",
			"ariaRole": "",
			"hidden": true,
			"hooks": []
		},
		{
			"part": "indicator",
			"role": "indicator",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-grid"
			]
		},
		{
			"part": "label",
			"role": "label",
			"element": "span",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-disabled"
			]
		},
		{
			"part": "selection",
			"role": "selection",
			"element": "div",
			"ariaRole": "group",
			"hidden": false,
			"hooks": [
				"ui-disabled",
				"ui-dragging",
				"ui-fixed",
				"ui-resizing",
				"ui-selection"
			]
		},
		{
			"part": "thumb",
			"role": "thumb",
			"element": "div",
			"ariaRole": "slider",
			"hidden": false,
			"hooks": [
				"ui-block-end",
				"ui-block-start",
				"ui-disabled",
				"ui-handle",
				"ui-inline-end",
				"ui-inline-start",
				"ui-resizing"
			]
		}
	],
	"datebox": [
		{
			"part": "root",
			"role": "root",
			"element": "div",
			"ariaRole": "group",
			"hidden": false,
			"hooks": [
				"ui-disabled",
				"ui-empty",
				"ui-invalid",
				"ui-required"
			]
		},
		{
			"part": "dayinput",
			"role": "input",
			"element": "span",
			"ariaRole": "spinbutton",
			"hidden": false,
			"hooks": [
				"ui-disabled",
				"ui-placeholder",
				"ui-type",
				"ui-value"
			]
		},
		{
			"part": "description",
			"role": "description",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "error",
			"role": "error",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "field",
			"role": "field",
			"element": "input",
			"ariaRole": "",
			"hidden": true,
			"hooks": []
		},
		{
			"part": "label",
			"role": "label",
			"element": "label",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-disabled"
			]
		},
		{
			"part": "monthinput",
			"role": "input",
			"element": "span",
			"ariaRole": "spinbutton",
			"hidden": false,
			"hooks": [
				"ui-disabled",
				"ui-placeholder",
				"ui-type",
				"ui-value"
			]
		},
		{
			"part": "yearinput",
			"role": "input",
			"element": "span",
			"ariaRole": "spinbutton",
			"hidden": false,
			"hooks": [
				"ui-disabled",
				"ui-placeholder",
				"ui-type",
				"ui-value"
			]
		}
	],
	"drawer": [
		{
			"part": "root",
			"role": "root",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-closed",
				"ui-dragging",
				"ui-open",
				"ui-orientation",
				"ui-start"
			]
		},
		{
			"part": "trigger",
			"role": "trigger",
			"element": "button",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-closed",
				"ui-open"
			]
		},
		{
			"part": "backdrop",
			"role": "backdrop",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-backdrop",
				"ui-closed",
				"ui-open",
				"ui-orientation",
				"ui-start"
			]
		},
		{
			"part": "content",
			"role": "content",
			"element": "div",
			"ariaRole": "dialog",
			"hidden": false,
			"hooks": [
				"ui-closed",
				"ui-content",
				"ui-dragging",
				"ui-open",
				"ui-orientation",
				"ui-start"
			]
		},
		{
			"part": "title",
			"role": "title",
			"element": "h2",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "description",
			"role": "description",
			"element": "p",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "close",
			"role": "close",
			"element": "button",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		}
	],
	"editable": [
		{
			"part": "root",
			"role": "root",
			"element": "div",
			"ariaRole": "group",
			"hidden": false,
			"hooks": [
				"ui-disabled",
				"ui-editing",
				"ui-invalid",
				"ui-readonly",
				"ui-required",
				"ui-value"
			]
		},
		{
			"part": "description",
			"role": "description",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "error",
			"role": "error",
			"element": "div",
			"ariaRole": "alert",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "field",
			"role": "field",
			"element": "input",
			"ariaRole": "",
			"hidden": true,
			"hooks": []
		},
		{
			"part": "input",
			"role": "input",
			"element": "input",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "label",
			"role": "label",
			"element": "label",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-disabled"
			]
		},
		{
			"part": "trigger",
			"role": "trigger",
			"element": "button",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-empty",
				"ui-readonly"
			]
		}
	],
	"fileupload": [
		{
			"part": "root",
			"role": "root",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-disabled"
			]
		},
		{
			"part": "droparea",
			"role": "area",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-disabled",
				"ui-dragging"
			]
		},
		{
			"part": "field",
			"role": "field",
			"element": "input",
			"ariaRole": "",
			"hidden": true,
			"hooks": []
		},
		{
			"part": "item",
			"role": "item",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-disabled"
			]
		},
		{
			"part": "itemclose",
			"role": "close",
			"element": "button",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "itemlabel",
			"role": "label",
			"element": "span",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "label",
			"role": "label",
			"element": "label",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "trigger",
			"role": "trigger",
			"element": "button",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-disabled"
			]
		}
	],
	"gridlist": [
		{
			"part": "root",
			"role": "root",
			"element": "div",
			"ariaRole": "grid",
			"hidden": false,
			"hooks": [
				"ui-disabled",
				"ui-inside",
				"ui-multiple",
				"ui-selectable"
			]
		},
		{
			"part": "item",
			"role": "item",
			"element": "div",
			"ariaRole": "row",
			"hidden": false,
			"hooks": [
				"ui-disabled",
				"ui-selected",
				"ui-value"
			]
		},
		{
			"part": "itemcontent",
			"role": "content",
			"element": "div",
			"ariaRole": "gridcell",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "itemindicator",
			"role": "indicator",
			"element": "span",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-selected"
			]
		},
		{
			"part": "itemlabel",
			"role": "label",
			"element": "span",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "itemtrigger",
			"role": "trigger",
			"element": "button",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "label",
			"role": "label",
			"element": "span",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		}
	],
	"hovercard": [
		{
			"part": "root",
			"role": "root",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-closed",
				"ui-open"
			]
		},
		{
			"part": "trigger",
			"role": "trigger",
			"element": "a",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-closed",
				"ui-open"
			]
		},
		{
			"part": "content",
			"role": "content",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-closed",
				"ui-open"
			]
		}
	],
	"ink": [
		{
			"part": "root",
			"role": "root",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-disabled",
				"ui-drawing",
				"ui-empty",
				"ui-readonly"
			]
		},
		{
			"part": "area",
			"role": "area",
			"element": "svg",
			"ariaRole": "img",
			"hidden": false,
			"hooks": [
				"ui-current",
				"ui-disabled",
				"ui-drawing",
				"ui-empty",
				"ui-readonly",
				"ui-stroke",
				"ui-surface"
			]
		},
		{
			"part": "description",
			"role": "description",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "error",
			"role": "error",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "field",
			"role": "field",
			"element": "input",
			"ariaRole": "",
			"hidden": true,
			"hooks": []
		},
		{
			"part": "indicator",
			"role": "indicator",
			"element": "line",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-guide"
			]
		},
		{
			"part": "label",
			"role": "label",
			"element": "span",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-disabled"
			]
		}
	],
	"menu": [
		{
			"part": "root",
			"role": "root",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-closed",
				"ui-disabled",
				"ui-open"
			]
		},
		{
			"part": "content",
			"role": "content",
			"element": "div",
			"ariaRole": "menu",
			"hidden": false,
			"hooks": [
				"ui-closed",
				"ui-open"
			]
		},
		{
			"part": "contextarea",
			"role": "area",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-closed",
				"ui-open"
			]
		},
		{
			"part": "item",
			"role": "item",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-checked",
				"ui-disabled",
				"ui-open"
			]
		},
		{
			"part": "itemcontent",
			"role": "content",
			"element": "div",
			"ariaRole": "menu",
			"hidden": false,
			"hooks": [
				"ui-closed",
				"ui-open"
			]
		},
		{
			"part": "trigger",
			"role": "trigger",
			"element": "button",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-closed",
				"ui-open"
			]
		}
	],
	"menubar": [
		{
			"part": "root",
			"role": "root",
			"element": "div",
			"ariaRole": "menubar",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "item",
			"role": "item",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-closed",
				"ui-disabled",
				"ui-open"
			]
		},
		{
			"part": "itemcontent",
			"role": "content",
			"element": "div",
			"ariaRole": "menu",
			"hidden": false,
			"hooks": [
				"ui-closed",
				"ui-open"
			]
		},
		{
			"part": "label",
			"role": "label",
			"element": "span",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		}
	],
	"modal": [
		{
			"part": "root",
			"role": "root",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-closed",
				"ui-open"
			]
		},
		{
			"part": "trigger",
			"role": "trigger",
			"element": "button",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-closed",
				"ui-open"
			]
		},
		{
			"part": "backdrop",
			"role": "backdrop",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-closed",
				"ui-open"
			]
		},
		{
			"part": "content",
			"role": "content",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-closed",
				"ui-open"
			]
		},
		{
			"part": "title",
			"role": "title",
			"element": "h2",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "description",
			"role": "description",
			"element": "p",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "close",
			"role": "close",
			"element": "button",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		}
	],
	"navbar": [
		{
			"part": "root",
			"role": "root",
			"element": "nav",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-closed",
				"ui-open"
			]
		},
		{
			"part": "item",
			"role": "item",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-active",
				"ui-closed",
				"ui-open"
			]
		},
		{
			"part": "itemtrigger",
			"role": "trigger",
			"element": "button",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-closed",
				"ui-open"
			]
		},
		{
			"part": "itemcontent",
			"role": "content",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-closed",
				"ui-open"
			]
		},
		{
			"part": "itemlink",
			"role": "",
			"element": "a",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-active"
			]
		}
	],
	"numberbox": [
		{
			"part": "root",
			"role": "root",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-disabled",
				"ui-empty",
				"ui-invalid",
				"ui-readonly",
				"ui-required"
			]
		},
		{
			"part": "backtrigger",
			"role": "trigger",
			"element": "button",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-disabled"
			]
		},
		{
			"part": "description",
			"role": "description",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "error",
			"role": "error",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "field",
			"role": "field",
			"element": "input",
			"ariaRole": "",
			"hidden": true,
			"hooks": []
		},
		{
			"part": "forwardtrigger",
			"role": "trigger",
			"element": "button",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-disabled"
			]
		},
		{
			"part": "input",
			"role": "input",
			"element": "input",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "label",
			"role": "label",
			"element": "label",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-disabled"
			]
		},
		{
			"part": "valuelabel",
			"role": "label",
			"element": "output",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-disabled",
				"ui-value"
			]
		}
	],
	"otp": [
		{
			"part": "root",
			"role": "root",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-disabled"
			]
		},
		{
			"part": "field",
			"role": "field",
			"element": "input",
			"ariaRole": "",
			"hidden": true,
			"hooks": []
		},
		{
			"part": "item",
			"role": "item",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-disabled",
				"ui-empty"
			]
		},
		{
			"part": "itemindicator",
			"role": "indicator",
			"element": "span",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		}
	],
	"pad": [
		{
			"part": "root",
			"role": "root",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-disabled",
				"ui-dragging"
			]
		},
		{
			"part": "area",
			"role": "area",
			"element": "div",
			"ariaRole": "group",
			"hidden": false,
			"hooks": [
				"ui-disabled",
				"ui-dragging",
				"ui-plane"
			]
		},
		{
			"part": "description",
			"role": "description",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "error",
			"role": "error",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "field",
			"role": "field",
			"element": "input",
			"ariaRole": "",
			"hidden": true,
			"hooks": []
		},
		{
			"part": "indicator",
			"role": "indicator",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-grid"
			]
		},
		{
			"part": "label",
			"role": "label",
			"element": "span",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-disabled"
			]
		},
		{
			"part": "thumb",
			"role": "thumb",
			"element": "div",
			"ariaRole": "slider",
			"hidden": false,
			"hooks": [
				"ui-active",
				"ui-disabled",
				"ui-handle"
			]
		},
		{
			"part": "valuelabel",
			"role": "label",
			"element": "output",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-disabled",
				"ui-value"
			]
		}
	],
	"pagination": [
		{
			"part": "root",
			"role": "root",
			"element": "nav",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-disabled"
			]
		},
		{
			"part": "backtrigger",
			"role": "trigger",
			"element": "button",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "forwardtrigger",
			"role": "trigger",
			"element": "button",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "item",
			"role": "item",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-active"
			]
		},
		{
			"part": "itemlink",
			"role": "",
			"element": "a",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-active"
			]
		},
		{
			"part": "itemtrigger",
			"role": "trigger",
			"element": "button",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-active"
			]
		}
	],
	"popover": [
		{
			"part": "root",
			"role": "root",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-closed",
				"ui-open"
			]
		},
		{
			"part": "trigger",
			"role": "trigger",
			"element": "button",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-closed",
				"ui-open"
			]
		},
		{
			"part": "content",
			"role": "content",
			"element": "div",
			"ariaRole": "dialog",
			"hidden": false,
			"hooks": [
				"ui-closed",
				"ui-open"
			]
		},
		{
			"part": "title",
			"role": "title",
			"element": "h2",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "description",
			"role": "description",
			"element": "p",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "close",
			"role": "close",
			"element": "button",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		}
	],
	"progress": [
		{
			"part": "root",
			"role": "root",
			"element": "div",
			"ariaRole": "progressbar",
			"hidden": false,
			"hooks": [
				"ui-max",
				"ui-min",
				"ui-progress",
				"ui-value"
			]
		},
		{
			"part": "indicator",
			"role": "indicator",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-max",
				"ui-min",
				"ui-progress",
				"ui-value"
			]
		},
		{
			"part": "label",
			"role": "label",
			"element": "span",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-max",
				"ui-min",
				"ui-progress",
				"ui-value"
			]
		},
		{
			"part": "track",
			"role": "track",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-max",
				"ui-min",
				"ui-progress",
				"ui-value"
			]
		},
		{
			"part": "valuelabel",
			"role": "label",
			"element": "span",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-max",
				"ui-min",
				"ui-progress",
				"ui-value"
			]
		}
	],
	"qrcode": [
		{
			"part": "root",
			"role": "root",
			"element": "div",
			"ariaRole": "img",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "frame",
			"role": "",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "overlay",
			"role": "",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "patternpath",
			"role": "",
			"element": "path",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "patternsvg",
			"role": "",
			"element": "svg",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		}
	],
	"radiogroup": [
		{
			"part": "root",
			"role": "root",
			"element": "div",
			"ariaRole": "radiogroup",
			"hidden": false,
			"hooks": [
				"ui-disabled",
				"ui-horizontal",
				"ui-required"
			]
		},
		{
			"part": "description",
			"role": "description",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "error",
			"role": "error",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "item",
			"role": "item",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-disabled",
				"ui-selected"
			]
		},
		{
			"part": "itemfield",
			"role": "field",
			"element": "input",
			"ariaRole": "",
			"hidden": true,
			"hooks": []
		},
		{
			"part": "itemindicator",
			"role": "indicator",
			"element": "span",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "itemlabel",
			"role": "label",
			"element": "label",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "itemtrigger",
			"role": "trigger",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-disabled",
				"ui-selected"
			]
		},
		{
			"part": "label",
			"role": "label",
			"element": "label",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		}
	],
	"rating": [
		{
			"part": "root",
			"role": "root",
			"element": "div",
			"ariaRole": "radiogroup",
			"hidden": false,
			"hooks": [
				"ui-count",
				"ui-disabled",
				"ui-readonly",
				"ui-required",
				"ui-value"
			]
		},
		{
			"part": "description",
			"role": "description",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "error",
			"role": "error",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "field",
			"role": "field",
			"element": "input",
			"ariaRole": "",
			"hidden": true,
			"hooks": []
		},
		{
			"part": "item",
			"role": "item",
			"element": "div",
			"ariaRole": "radio",
			"hidden": false,
			"hooks": [
				"ui-disabled",
				"ui-filled",
				"ui-half",
				"ui-preview",
				"ui-readonly",
				"ui-star",
				"ui-value"
			]
		},
		{
			"part": "label",
			"role": "label",
			"element": "span",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-disabled"
			]
		},
		{
			"part": "valuelabel",
			"role": "label",
			"element": "output",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-disabled",
				"ui-readonly",
				"ui-value"
			]
		}
	],
	"resizable": [
		{
			"part": "root",
			"role": "root",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-disabled",
				"ui-dragging",
				"ui-orientation",
				"ui-panels"
			]
		},
		{
			"part": "item",
			"role": "item",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-collapsed",
				"ui-orientation",
				"ui-panel",
				"ui-size",
				"ui-value"
			]
		},
		{
			"part": "thumb",
			"role": "thumb",
			"element": "div",
			"ariaRole": "separator",
			"hidden": false,
			"hooks": [
				"ui-collapsed",
				"ui-collapsible",
				"ui-disabled",
				"ui-divider",
				"ui-dragging",
				"ui-max",
				"ui-min",
				"ui-orientation",
				"ui-value"
			]
		}
	],
	"select": [
		{
			"part": "root",
			"role": "root",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-closed",
				"ui-disabled",
				"ui-open",
				"ui-required"
			]
		},
		{
			"part": "label",
			"role": "label",
			"element": "label",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "trigger",
			"role": "trigger",
			"element": "button",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-closed",
				"ui-open"
			]
		},
		{
			"part": "content",
			"role": "content",
			"element": "div",
			"ariaRole": "listbox",
			"hidden": false,
			"hooks": [
				"ui-closed",
				"ui-open"
			]
		},
		{
			"part": "item",
			"role": "item",
			"element": "div",
			"ariaRole": "option",
			"hidden": false,
			"hooks": [
				"ui-disabled",
				"ui-selected"
			]
		},
		{
			"part": "itemlabel",
			"role": "label",
			"element": "span",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "itemindicator",
			"role": "indicator",
			"element": "span",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-hidden"
			]
		},
		{
			"part": "field",
			"role": "field",
			"element": "select",
			"ariaRole": "",
			"hidden": true,
			"hooks": []
		}
	],
	"slider": [
		{
			"part": "root",
			"role": "root",
			"element": "div",
			"ariaRole": "group",
			"hidden": false,
			"hooks": [
				"ui-disabled",
				"ui-max",
				"ui-min",
				"ui-orientation"
			]
		},
		{
			"part": "label",
			"role": "label",
			"element": "span",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-disabled"
			]
		},
		{
			"part": "thumb",
			"role": "thumb",
			"element": "div",
			"ariaRole": "slider",
			"hidden": false,
			"hooks": [
				"ui-disabled",
				"ui-dragging",
				"ui-max",
				"ui-min",
				"ui-orientation",
				"ui-side",
				"ui-value"
			]
		},
		{
			"part": "track",
			"role": "track",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-disabled",
				"ui-dragging",
				"ui-max",
				"ui-min",
				"ui-orientation"
			]
		},
		{
			"part": "valuelabel",
			"role": "label",
			"element": "output",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-disabled",
				"ui-max",
				"ui-min",
				"ui-orientation",
				"ui-value"
			]
		}
	],
	"table": [
		{
			"part": "root",
			"role": "root",
			"element": "table",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-disabled",
				"ui-multiple",
				"ui-selectable"
			]
		},
		{
			"part": "coltrigger",
			"role": "trigger",
			"element": "th",
			"ariaRole": "columnheader",
			"hidden": false,
			"hooks": [
				"ui-sorted",
				"ui-value"
			]
		},
		{
			"part": "item",
			"role": "item",
			"element": "tr",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-disabled",
				"ui-selected",
				"ui-value"
			]
		},
		{
			"part": "itemcontent",
			"role": "content",
			"element": "th",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "itemfield",
			"role": "field",
			"element": "input",
			"ariaRole": "",
			"hidden": true,
			"hooks": []
		}
	],
	"tabs": [
		{
			"part": "root",
			"role": "root",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-vertical"
			]
		},
		{
			"part": "content",
			"role": "content",
			"element": "div",
			"ariaRole": "tabpanel",
			"hidden": false,
			"hooks": [
				"ui-selected"
			]
		},
		{
			"part": "list",
			"role": "",
			"element": "div",
			"ariaRole": "tablist",
			"hidden": false,
			"hooks": [
				"ui-vertical"
			]
		},
		{
			"part": "trigger",
			"role": "trigger",
			"element": "button",
			"ariaRole": "tab",
			"hidden": false,
			"hooks": [
				"ui-selected",
				"ui-vertical"
			]
		}
	],
	"taglist": [
		{
			"part": "root",
			"role": "root",
			"element": "div",
			"ariaRole": "group",
			"hidden": false,
			"hooks": [
				"ui-disabled",
				"ui-empty",
				"ui-invalid",
				"ui-required"
			]
		},
		{
			"part": "description",
			"role": "description",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "error",
			"role": "error",
			"element": "div",
			"ariaRole": "alert",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "field",
			"role": "field",
			"element": "input",
			"ariaRole": "presentation",
			"hidden": true,
			"hooks": []
		},
		{
			"part": "input",
			"role": "input",
			"element": "input",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-empty"
			]
		},
		{
			"part": "item",
			"role": "item",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-disabled",
				"ui-editing",
				"ui-highlighted",
				"ui-value"
			]
		},
		{
			"part": "itemclose",
			"role": "close",
			"element": "button",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-highlighted",
				"ui-value"
			]
		},
		{
			"part": "iteminput",
			"role": "input",
			"element": "input",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-value"
			]
		},
		{
			"part": "itemlabel",
			"role": "label",
			"element": "span",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "label",
			"role": "label",
			"element": "label",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		}
	],
	"textbox": [
		{
			"part": "root",
			"role": "root",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-disabled",
				"ui-empty",
				"ui-invalid",
				"ui-readonly",
				"ui-required"
			]
		},
		{
			"part": "description",
			"role": "description",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "error",
			"role": "error",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "input",
			"role": "input",
			"element": "input",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "label",
			"role": "label",
			"element": "label",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "textarea",
			"role": "area",
			"element": "textarea",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		}
	],
	"timebox": [
		{
			"part": "root",
			"role": "root",
			"element": "div",
			"ariaRole": "group",
			"hidden": false,
			"hooks": [
				"ui-disabled",
				"ui-empty",
				"ui-hour12",
				"ui-order",
				"ui-readonly",
				"ui-required"
			]
		},
		{
			"part": "dayperiodinput",
			"role": "input",
			"element": "span",
			"ariaRole": "spinbutton",
			"hidden": false,
			"hooks": [
				"ui-disabled",
				"ui-placeholder",
				"ui-readonly",
				"ui-type",
				"ui-value"
			]
		},
		{
			"part": "description",
			"role": "description",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "error",
			"role": "error",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "field",
			"role": "field",
			"element": "input",
			"ariaRole": "",
			"hidden": true,
			"hooks": []
		},
		{
			"part": "hourinput",
			"role": "input",
			"element": "span",
			"ariaRole": "spinbutton",
			"hidden": false,
			"hooks": [
				"ui-disabled",
				"ui-placeholder",
				"ui-readonly",
				"ui-type",
				"ui-value"
			]
		},
		{
			"part": "label",
			"role": "label",
			"element": "label",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-disabled"
			]
		},
		{
			"part": "minuteinput",
			"role": "input",
			"element": "span",
			"ariaRole": "spinbutton",
			"hidden": false,
			"hooks": [
				"ui-disabled",
				"ui-placeholder",
				"ui-readonly",
				"ui-type",
				"ui-value"
			]
		},
		{
			"part": "secondinput",
			"role": "input",
			"element": "span",
			"ariaRole": "spinbutton",
			"hidden": false,
			"hooks": [
				"ui-disabled",
				"ui-placeholder",
				"ui-readonly",
				"ui-type",
				"ui-value"
			]
		}
	],
	"toaster": [
		{
			"part": "root",
			"role": "root",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-paused",
				"ui-toaster"
			]
		},
		{
			"part": "item",
			"role": "item",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-front",
				"ui-toast",
				"ui-tone"
			]
		},
		{
			"part": "itemclose",
			"role": "close",
			"element": "button",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-toastclose"
			]
		},
		{
			"part": "itemdescription",
			"role": "description",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-toastdescription"
			]
		},
		{
			"part": "itemicon",
			"role": "",
			"element": "span",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-toasticon"
			]
		},
		{
			"part": "itemtitle",
			"role": "title",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-toasttitle"
			]
		}
	],
	"toggle": [
		{
			"part": "root",
			"role": "root",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-checked",
				"ui-disabled"
			]
		},
		{
			"part": "label",
			"role": "label",
			"element": "label",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "trigger",
			"role": "trigger",
			"element": "button",
			"ariaRole": "switch",
			"hidden": false,
			"hooks": [
				"ui-checked",
				"ui-disabled"
			]
		},
		{
			"part": "thumb",
			"role": "thumb",
			"element": "span",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "description",
			"role": "description",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "error",
			"role": "error",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "field",
			"role": "field",
			"element": "input",
			"ariaRole": "",
			"hidden": true,
			"hooks": []
		}
	],
	"tokenbox": [
		{
			"part": "root",
			"role": "root",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-disabled",
				"ui-empty",
				"ui-invalid",
				"ui-required",
				"ui-tokenbox"
			]
		},
		{
			"part": "description",
			"role": "description",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "error",
			"role": "error",
			"element": "div",
			"ariaRole": "alert",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "field",
			"role": "field",
			"element": "input",
			"ariaRole": "presentation",
			"hidden": true,
			"hooks": []
		},
		{
			"part": "input",
			"role": "input",
			"element": "div",
			"ariaRole": "textbox",
			"hidden": false,
			"hooks": [
				"ui-editor",
				"ui-empty",
				"ui-text",
				"ui-token",
				"ui-value"
			]
		},
		{
			"part": "itemtrigger",
			"role": "trigger",
			"element": "button",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-value"
			]
		},
		{
			"part": "label",
			"role": "label",
			"element": "label",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		}
	],
	"toolbar": [
		{
			"part": "root",
			"role": "root",
			"element": "div",
			"ariaRole": "toolbar",
			"hidden": false,
			"hooks": [
				"ui-vertical"
			]
		},
		{
			"part": "item",
			"role": "item",
			"element": "button",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-disabled"
			]
		},
		{
			"part": "label",
			"role": "label",
			"element": "span",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		}
	],
	"tooltip": [
		{
			"part": "root",
			"role": "root",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-closed",
				"ui-open"
			]
		},
		{
			"part": "trigger",
			"role": "trigger",
			"element": "button",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-closed",
				"ui-open"
			]
		},
		{
			"part": "content",
			"role": "content",
			"element": "div",
			"ariaRole": "tooltip",
			"hidden": false,
			"hooks": [
				"ui-closed",
				"ui-open"
			]
		}
	],
	"tour": [
		{
			"part": "root",
			"role": "root",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-closed",
				"ui-disabled",
				"ui-max",
				"ui-open"
			]
		},
		{
			"part": "backdrop",
			"role": "backdrop",
			"element": "div",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-closed",
				"ui-open",
				"ui-spotlight"
			]
		},
		{
			"part": "backtrigger",
			"role": "trigger",
			"element": "button",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-disabled"
			]
		},
		{
			"part": "close",
			"role": "close",
			"element": "button",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "description",
			"role": "description",
			"element": "p",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "forwardtrigger",
			"role": "trigger",
			"element": "button",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-disabled"
			]
		},
		{
			"part": "item",
			"role": "item",
			"element": "div",
			"ariaRole": "dialog",
			"hidden": false,
			"hooks": [
				"ui-closed",
				"ui-current",
				"ui-open"
			]
		},
		{
			"part": "title",
			"role": "title",
			"element": "h2",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "valuelabel",
			"role": "label",
			"element": "span",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-max",
				"ui-value"
			]
		}
	],
	"tree": [
		{
			"part": "root",
			"role": "root",
			"element": "div",
			"ariaRole": "tree",
			"hidden": false,
			"hooks": [
				"ui-disabled",
				"ui-inside"
			]
		},
		{
			"part": "item",
			"role": "item",
			"element": "div",
			"ariaRole": "treeitem",
			"hidden": false,
			"hooks": [
				"ui-closed",
				"ui-disabled",
				"ui-leaf",
				"ui-open"
			]
		},
		{
			"part": "itemcontent",
			"role": "content",
			"element": "div",
			"ariaRole": "group",
			"hidden": false,
			"hooks": [
				"ui-closed",
				"ui-open"
			]
		},
		{
			"part": "itemindicator",
			"role": "indicator",
			"element": "span",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-closed",
				"ui-open"
			]
		},
		{
			"part": "itemlabel",
			"role": "label",
			"element": "span",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		},
		{
			"part": "itemtrigger",
			"role": "trigger",
			"element": "button",
			"ariaRole": "",
			"hidden": false,
			"hooks": [
				"ui-closed",
				"ui-open"
			]
		},
		{
			"part": "label",
			"role": "label",
			"element": "span",
			"ariaRole": "",
			"hidden": false,
			"hooks": []
		}
	]
};
