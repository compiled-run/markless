import { element, state } from '@markless/core';
import {
	calendar,
	checkbox,
	checklist,
	colorpicker,
	datebox,
	fileupload,
	hovercard,
	menu,
	modal,
	numberbox,
	popover,
	progress,
	radiogroup,
	select,
	slider,
	tabs,
	textbox,
	toggle,
	togglegroup,
	tooltip,
	tour,
} from '@markless/ui';

// Every shipped family's Basic scenario - the starter a consumer copies - on one
// page, each in a section a reader can jump to by its anchor: /#checkbox,
// /#toggle, /#textbox, /#progress, /#checklist, /#select, /#modal,
// /#radio-group, /#tabs, /#popover, /#tooltip, /#slider, /#datebox,
// /#fileupload, /#hovercard, /#calendar, /#menu, /#colorpicker,
// /#togglegroup, /#numberbox, /#tour. A family whose second shape a reader
// announces differently gets its own section too: /#slider-range,
// /#numberbox-min-max-step, /#numberbox-currency.
//
// This is consumer code, not test code. It imports through the package barrel
// the way a reader of the docs would, carries no test hooks, and the markup is
// the family's real starter rather than something shaped to make an assertion
// easy.
export function Gallery() @{
	<main>
		<h1>Markless UI screen reader gallery</h1>

		<section id="checkbox">
			<h2>Checkbox</h2>
			<div class="scenario">
				<checkbox.root>
					<checkbox.trigger>
						<checkbox.indicator>Checked</checkbox.indicator>
					</checkbox.trigger>
					<checkbox.label>Checkbox Label</checkbox.label>
				</checkbox.root>
			</div>
		</section>

		<section id="toggle">
			<h2>Toggle</h2>
			<div class="scenario">
				<toggle.root>
					<toggle.label>Enable notifications</toggle.label>
					<toggle.trigger><toggle.thumb /></toggle.trigger>
				</toggle.root>
			</div>
		</section>

		<section id="textbox">
			<h2>Textbox</h2>
			<div class="scenario">
				<textbox.root name="username">
					<textbox.label>Username</textbox.label>
					<textbox.input />
				</textbox.root>
			</div>
		</section>

		<section id="progress">
			<h2>Progress</h2>
			<div class="scenario">
				<progress.root value={30}>
					<progress.label>Export data</progress.label>
					<progress.valuelabel />
					<progress.track><progress.indicator /></progress.track>
				</progress.root>
			</div>
		</section>

		<section id="checklist">
			<h2>Checklist</h2>
			<div class="scenario">
				<checklist.root values={['lettuce', 'tomato', 'mustard']}>
					<checklist.label>Sandwich Condiments</checklist.label>
					<checklist.selectall>
						<checklist.selectallindicator>Checked</checklist.selectallindicator>
					</checklist.selectall>
					<checklist.item value="lettuce">
						<checklist.itemtrigger>
							<checklist.itemindicator>Checked</checklist.itemindicator>
						</checklist.itemtrigger>
						<checklist.itemlabel>Lettuce</checklist.itemlabel>
					</checklist.item>
					<checklist.item value="tomato">
						<checklist.itemtrigger>
							<checklist.itemindicator>Checked</checklist.itemindicator>
						</checklist.itemtrigger>
						<checklist.itemlabel>Tomato</checklist.itemlabel>
					</checklist.item>
					<checklist.item value="mustard">
						<checklist.itemtrigger>
							<checklist.itemindicator>Checked</checklist.itemindicator>
						</checklist.itemtrigger>
						<checklist.itemlabel>Mustard</checklist.itemlabel>
					</checklist.item>
				</checklist.root>
			</div>
		</section>

		<section id="select">
			<h2>Select</h2>
			<div class="scenario">
				<select.root>
					<select.label>Favorite Fruit</select.label>
					<select.trigger>Choose a Fruit</select.trigger>
					<select.content>
						<select.item value="apple">
							<select.itemlabel>Apple</select.itemlabel>
							<select.itemindicator>Chosen</select.itemindicator>
						</select.item>
						<select.item value="banana">
							<select.itemlabel>Banana</select.itemlabel>
							<select.itemindicator>Chosen</select.itemindicator>
						</select.item>
						<select.item value="cherry">
							<select.itemlabel>Cherry</select.itemlabel>
							<select.itemindicator>Chosen</select.itemindicator>
						</select.item>
					</select.content>
				</select.root>
			</div>
		</section>

		<section id="modal">
			<h2>Modal</h2>
			<div class="scenario">
				<modal.root>
					<modal.trigger>Edit address</modal.trigger>
					<modal.backdrop>
						<modal.content>
							<modal.title>Edit delivery address</modal.title>
							<modal.close>Cancel</modal.close>
						</modal.content>
					</modal.backdrop>
				</modal.root>
			</div>
		</section>

		<section id="radio-group">
			<h2>Radio group</h2>
			<div class="scenario">
				<radiogroup.root>
					<radiogroup.label>Billing Period</radiogroup.label>
					<radiogroup.item value="monthly">
						<radiogroup.itemfield />
						<radiogroup.itemtrigger>
							<radiogroup.itemindicator>Chosen</radiogroup.itemindicator>
						</radiogroup.itemtrigger>
						<radiogroup.itemlabel>Monthly</radiogroup.itemlabel>
					</radiogroup.item>
					<radiogroup.item value="annual">
						<radiogroup.itemfield />
						<radiogroup.itemtrigger>
							<radiogroup.itemindicator>Chosen</radiogroup.itemindicator>
						</radiogroup.itemtrigger>
						<radiogroup.itemlabel>Annual</radiogroup.itemlabel>
					</radiogroup.item>
					<radiogroup.item value="lifetime">
						<radiogroup.itemfield />
						<radiogroup.itemtrigger>
							<radiogroup.itemindicator>Chosen</radiogroup.itemindicator>
						</radiogroup.itemtrigger>
						<radiogroup.itemlabel>Lifetime</radiogroup.itemlabel>
					</radiogroup.item>
				</radiogroup.root>
			</div>
		</section>

		<section id="tabs">
			<h2>Tabs</h2>
			<div class="scenario">
				<tabs.root value="overview">
					<tabs.list>
						<tabs.trigger value="overview">Overview</tabs.trigger>
						<tabs.trigger value="usage">Usage</tabs.trigger>
						<tabs.trigger value="billing">Billing</tabs.trigger>
					</tabs.list>
					<tabs.content value="overview">Everything that happened this month.</tabs.content>
					<tabs.content value="usage">How much of the plan you have used.</tabs.content>
					<tabs.content value="billing">Your next invoice is due on the 1st.</tabs.content>
				</tabs.root>
			</div>
		</section>

		<section id="popover">
			<h2>Popover</h2>
			<div class="scenario">
				<popover.root>
					<popover.trigger>Share</popover.trigger>
					<popover.content>
						<popover.title>Share this page</popover.title>
						<popover.description>Anyone with the link can read it.</popover.description>
						<popover.close>Done</popover.close>
					</popover.content>
				</popover.root>
			</div>
		</section>

		<section id="tooltip">
			<h2>Tooltip</h2>
			<div class="scenario">
				<tooltip.root>
					<tooltip.trigger aria-label="Save">Save</tooltip.trigger>
					<tooltip.content class="tip">Save this draft</tooltip.content>
				</tooltip.root>
			</div>
		</section>

		<section id="slider">
			<h2>Slider</h2>
			<div class="scenario">
				<slider.root value={40}>
					<slider.label>Volume</slider.label>
					<slider.valuelabel />
					<slider.track class="slider-track"><slider.thumb class="slider-thumb" /></slider.track>
				</slider.root>
			</div>
		</section>

		<section id="slider-range">
			<h2>Slider (range)</h2>
			<div class="scenario">
				<slider.root value={[20, 80]}>
					<slider.label>Price</slider.label>
					<slider.valuelabel />
					<slider.track class="slider-track">
						<slider.thumb side="start" class="slider-thumb" />
						<slider.thumb side="end" class="slider-thumb" />
					</slider.track>
				</slider.root>
			</div>
		</section>

		<section id="datebox">
			<h2>Date box</h2>
			<div class="scenario">
				<datebox.root name="starts">
					<datebox.label>Start date</datebox.label>
					<datebox.monthinput />
					<datebox.dayinput />
					<datebox.yearinput />
					<datebox.field />
				</datebox.root>
			</div>
		</section>

		<section id="fileupload">
			<h2>File upload</h2>
			<div class="scenario">
				<fileupload.root name="attachment">
					<fileupload.label>Attachments</fileupload.label>
					<fileupload.droparea>
						Drop a file here
						<fileupload.trigger>Browse</fileupload.trigger>
					</fileupload.droparea>
					<fileupload.field />
					<FileRows />
				</fileupload.root>
			</div>
		</section>

		<section id="hovercard">
			<h2>Hover card</h2>
			{/* The family's doctrine, kept: everything in the card is also behind the trigger's own link, so a reader who never sees the card loses nothing. */}
			<div class="scenario">
				<hovercard.root>
					<hovercard.trigger href="/users/jane">Jane Doe</hovercard.trigger>
					<hovercard.content class="card">
						<a href="/users/jane">Open profile</a>
						<p>Builds compilers.</p>
						<a href="/users/jane/followers">312 followers</a>
					</hovercard.content>
				</hovercard.root>
			</div>
		</section>

		<section id="calendar">
			<h2>Calendar</h2>
			{/* A fixed month, one day already chosen and one a person may not choose, so what a reader hears on each is the same on every run. */}
			<div class="scenario">
				<calendar.root
					month="2026-08-01"
					value="2026-08-14"
					unavailable={['2026-08-19']}
					name="starts"
				>
					<calendar.label>Pick a date</calendar.label>
					<CalendarMonth />
					<calendar.field />
				</calendar.root>
			</div>
		</section>

		<section id="menu">
			<h2>Menu</h2>
			<div class="scenario">
				<menu.root>
					<menu.trigger>Actions</menu.trigger>
					<menu.content class="menu-surface">
						<menu.item value="cut">Cut</menu.item>
						<menu.item value="copy">Copy</menu.item>
						<menu.item value="paste">Paste</menu.item>
					</menu.content>
				</menu.root>
			</div>
		</section>

		<section id="colorpicker">
			<h2>Colour picker</h2>
			{/* The inline picker, on a fixed colour, so what a reader hears on the plane and the rail is the same on every run. */}
			<div class="scenario">
				<colorpicker.root value="#3399ff" name="brand">
					<colorpicker.label>Brand colour</colorpicker.label>
					<colorpicker.content>
						<colorpicker.area class="picker-plane">
							<colorpicker.thumb class="picker-thumb" />
						</colorpicker.area>
						<colorpicker.track channel="hue" class="picker-rail">
							<colorpicker.thumb channel="hue" class="picker-thumb" />
						</colorpicker.track>
					</colorpicker.content>
					<colorpicker.valuelabel />
					<colorpicker.field />
				</colorpicker.root>
			</div>
		</section>

		<section id="togglegroup">
			<h2>Toggle group</h2>
			<div class="scenario">
				<togglegroup.root value="left">
					<togglegroup.label>Text alignment</togglegroup.label>
					<togglegroup.item value="left">Left</togglegroup.item>
					<togglegroup.item value="center">Center</togglegroup.item>
					<togglegroup.item value="right">Right</togglegroup.item>
				</togglegroup.root>
			</div>
		</section>

		{/* One numberbox per section: the step buttons are named "Decrease" and "Increase" whatever the field is called, and each root serves one live region, so two shapes under one anchor would leave a reader's walk with no way to tell which control it had reached. */}
		<section id="numberbox">
			<h2>Number box</h2>
			<div class="scenario">
				<numberbox.root name="quantity">
					<numberbox.label>Quantity</numberbox.label>
					<numberbox.backtrigger>-</numberbox.backtrigger>
					<numberbox.input />
					<numberbox.forwardtrigger>+</numberbox.forwardtrigger>
					<numberbox.valuelabel />
					<numberbox.field />
				</numberbox.root>
			</div>
		</section>

		<section id="numberbox-min-max-step">
			<h2>Number box (bounded)</h2>
			{/* With no role="spinbutton" there is no aria-valuemin/aria-valuemax, so the range reaches a reader only through the description. */}
			<div class="scenario">
				<numberbox.root value={1.5} min={0.5} max={3} step={0.25} name="dose">
					<numberbox.label>Dose</numberbox.label>
					<numberbox.backtrigger>-</numberbox.backtrigger>
					<numberbox.input />
					<numberbox.forwardtrigger>+</numberbox.forwardtrigger>
					<numberbox.description>
						A number between 0.5 and 3, in steps of 0.25.
					</numberbox.description>
					<numberbox.field />
				</numberbox.root>
			</div>
		</section>

		<section id="numberbox-currency">
			<h2>Number box (currency)</h2>
			<div class="scenario">
				<numberbox.root value={1299} min={0} step={0.01} currency="USD" name="price">
					<numberbox.label>Price</numberbox.label>
					<numberbox.backtrigger>-</numberbox.backtrigger>
					<numberbox.input />
					<numberbox.forwardtrigger>+</numberbox.forwardtrigger>
					<numberbox.valuelabel />
					<numberbox.field />
				</numberbox.root>
			</div>
		</section>

		{/* The tour's targets are the section's own buttons, reached through handles the page mints: a step may not look its target up, and a handle only crosses a component edge as a bare prop. The tour ships no trigger part, so "Take the tour" is the page's own button flipping `open`. */}
		<section id="tour">
			<h2>Tour</h2>
			<div class="scenario">
				<TourSection />
			</div>
		</section>
	</main>
}

function TourSection() @{
	const saveEl = element<HTMLButtonElement>();
	const shareEl = element<HTMLButtonElement>();
	const trashEl = element<HTMLButtonElement>();
	const page = state({ isOpen: false });

	<div>
		<div class="tour-toolbar">
			<button type="button" el={saveEl}>Save</button>
			<button type="button" el={shareEl}>Share</button>
			<button type="button" el={trashEl}>Delete</button>
		</div>
		<button
			type="button"
			onClick={() => {
				page.isOpen = true;
			}}
		>Take the tour</button>

		<tour.root
			open={page.isOpen}
			onOpenChange={(open) => {
				page.isOpen = open;
			}}
		>
			<tour.backdrop />

			<tour.item index={0} target={saveEl}>
				<tour.title>Save your work</tour.title>
				<tour.description>
					The Save button in the toolbar keeps a copy of the document.
				</tour.description>
				<tour.valuelabel />
				<tour.backtrigger>Back</tour.backtrigger>
				<tour.forwardtrigger>Next</tour.forwardtrigger>
				<tour.close>Skip the tour</tour.close>
			</tour.item>

			<tour.item index={1} target={shareEl} side="top">
				<tour.title>Share it</tour.title>
				<tour.description>
					The Share button beside Save sends a read-only link.
				</tour.description>
				<tour.valuelabel />
				<tour.backtrigger>Back</tour.backtrigger>
				<tour.forwardtrigger>Next</tour.forwardtrigger>
				<tour.close>Skip the tour</tour.close>
			</tour.item>

			<tour.item index={2} target={trashEl}>
				<tour.title>Delete it</tour.title>
				<tour.description>
					The Delete button at the end of the toolbar throws the document away.
				</tour.description>
				<tour.valuelabel />
				<tour.backtrigger>Back</tour.backtrigger>
				<tour.forwardtrigger>Next</tour.forwardtrigger>
				<tour.close>Done</tour.close>
			</tour.item>
		</tour.root>
	</div>
}

// The month is the consumer's own markup and sits inside the root, for the reason
// the file rows below carry: a component that reads the calendar's state is a
// part of that calendar's widget.
function CalendarMonth() @{
	const cal = calendar.state();

	<calendar.content>
		<div>
			<calendar.backtrigger>Back</calendar.backtrigger>
			<calendar.title />
			<calendar.forwardtrigger>Forward</calendar.forwardtrigger>
		</div>
		<div aria-hidden="true">
			@for (const name of cal.weekdays; key name) {
				<span>{name}</span>
			}
		</div>
		<div>
			@for (const day of cal.days; key day) {
				<calendar.item value={day} />
			}
		</div>
	</calendar.content>
}

// The list is the consumer's own markup and sits inside the root: a component that
// reads the upload's state is a part of that upload's widget, and one placed
// outside would start a second upload and repeat over its empty list.
function FileRows() @{
	const upload = fileupload.state();

	<div role="presentation">
		@for (const file of upload.files; key file.id) {
			<fileupload.item file={file}>
				<fileupload.itemlabel />
				<fileupload.itemclose aria-label="Remove">×</fileupload.itemclose>
			</fileupload.item>
		}
	</div>
}
