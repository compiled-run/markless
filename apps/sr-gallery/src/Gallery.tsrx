import { computed, element, state } from '@markless/core';
import type { PadPoint } from '@markless/ui/pad';
import {
	buttongroup,
	calendar,
	checkbox,
	checklist,
	colorpicker,
	crop,
	datebox,
	drawer,
	editable,
	fileupload,
	hovercard,
	ink,
	menu,
	menubar,
	modal,
	numberbox,
	pad,
	popover,
	progress,
	radiogroup,
	rating,
	resizable,
	select,
	slider,
	tabs,
	taglist,
	textbox,
	timebox,
	toggle,
	toolbar,
	tooltip,
	tour,
} from '@markless/ui';

// Every shipped family's Basic scenario - the starter a consumer copies - on one
// page, each in a section a reader can jump to by its anchor: /#checkbox,
// /#toggle, /#textbox, /#progress, /#checklist, /#select, /#modal,
// /#radio-group, /#rating, /#tabs, /#popover, /#tooltip, /#slider, /#datebox,
// /#fileupload, /#hovercard, /#calendar, /#menu, /#menubar, /#colorpicker,
// /#buttongroup, /#editable, /#taglist, /#numberbox, /#ink, /#pad, /#crop, /#tour, /#toolbar, /#drawer,
// /#resizable, /#timebox. A family whose
// second shape a reader announces differently gets its own section too: /#slider-range,
// /#numberbox-min-max-step, /#numberbox-currency, /#crop-image, /#timebox-twelve-hour.
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

		<section id="rating">
			<h2>Rating</h2>
			{/* Already rated, because the claim the real readers settle here is that a fill covering three marks is still one checked radio and four unchecked ones. */}
			<div class="scenario">
				<rating.root defaultValue={3}>
					<rating.label>Overall rating</rating.label>
					<RatingMarks />
					<rating.valuelabel />
				</rating.root>
			</div>

			{/* Half values: the near half of a mark is worth half of it. */}
			<div class="scenario">
				<rating.root half defaultValue={2.5}>
					<rating.label>Cleanliness</rating.label>
					<RatingMarks />
					<rating.valuelabel />
				</rating.root>
			</div>

			{/* The display-only aggregate: still a rating a reader can read, and nothing a person does changes it. */}
			<div class="scenario">
				<rating.root readonly half value={4.5}>
					<rating.label>Average guest rating</rating.label>
					<RatingMarks />
					<rating.valuelabel />
				</rating.root>
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

		{/* A bar is the item level's own recursion: each menubar.item is a menu item on the bar and holds the menu it drops down, and the menu family's parts go inside unchanged. */}
		<section id="menubar">
			<h2>Menubar</h2>
			<div class="scenario">
				<menubar.root>
					<menubar.label>Application</menubar.label>
					<menubar.item>
						File
						<menubar.itemcontent class="menu-surface">
							<menu.item value="new">New</menu.item>
							<menu.item value="recent" submenu>
								Open Recent
								<menu.itemcontent class="menu-surface">
									<menu.item value="draft">draft.md</menu.item>
									<menu.item value="notes">notes.md</menu.item>
								</menu.itemcontent>
							</menu.item>
						</menubar.itemcontent>
					</menubar.item>
					<menubar.item>
						Edit
						<menubar.itemcontent class="menu-surface">
							<menu.item value="undo">Undo</menu.item>
							<menu.item value="redo">Redo</menu.item>
						</menubar.itemcontent>
					</menubar.item>
					<menubar.item checked={['wrap']}>
						View
						<menubar.itemcontent class="menu-surface">
							<menu.item value="wrap" checked>Word wrap</menu.item>
							<menu.item value="zoom">Zoom in</menu.item>
						</menubar.itemcontent>
					</menubar.item>
				</menubar.root>
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

		<section id="buttongroup">
			<h2>Button group</h2>
			<div class="scenario">
				<buttongroup.root value="left">
					<buttongroup.label>Text alignment</buttongroup.label>
					<buttongroup.item value="left">Left</buttongroup.item>
					<buttongroup.item value="center">Center</buttongroup.item>
					<buttongroup.item value="right">Right</buttongroup.item>
				</buttongroup.root>
			</div>
		</section>

		{/* After #buttongroup on purpose: the buttongroup transcript walks to the first role="group" on the page by role alone, and an editable root is a role="group" too. */}
		<section id="editable">
			<h2>Editable</h2>
			<div class="scenario">
				<editable.root name="title" defaultValue="Quarterly plan">
					<editable.label>Document name</editable.label>
					<editable.trigger />
					<editable.input />
					<editable.field />
				</editable.root>
			</div>

			{/* Two clicks open this one; Enter and Space on the preview still do, because a gesture only a mouse can make is not a keyboard-operable control. */}
			<div class="scenario">
				<editable.root editOnDoubleClick defaultValue="notes.md">
					<editable.label>File name</editable.label>
					<editable.trigger />
					<editable.input />
				</editable.root>
			</div>

			{/* Read-only: still focusable and still readable, and no gesture opens a session. */}
			<div class="scenario">
				<editable.root readonly defaultValue="published">
					<editable.label>Published name</editable.label>
					<editable.trigger />
					<editable.input />
				</editable.root>
			</div>
		</section>

		{/* After #buttongroup for the reason #editable carries: a taglist root is a role="group" too, and NVDA says "grouping" for a radiogroup as well, so a section of groups before #radio-group would end that lane's walk on the wrong widget. */}
		<section id="taglist">
			<h2>Tag list</h2>
			<div class="scenario">
				<TopicTags />
			</div>

			{/* No field at all: nothing here adds a tag, and the delete buttons are still ordinary tab stops carrying the whole arrow walk. */}
			<div class="scenario">
				<FilterTags />
			</div>

			{/* Per-tag inline edit, opt in: Enter on a highlighted tag opens its own field, F2 opens the tag that has focus. */}
			<div class="scenario">
				<StageTags />
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

		<section id="ink">
			<h2>Ink</h2>
			<div class="scenario">
				<ink.root name="drawing">
					<ink.label>Drawing</ink.label>
					<ink.description>Draw with a mouse, pen or finger. Undo with Control or Command and Z.</ink.description>
					<ink.area class="ink-surface" />
					<ink.field />
				</ink.root>
			</div>

			{/* A drawn signature carries no text, so WCAG 1.1.1 makes the equivalent the consumer's: the typed name beside the pad is what a reader gets instead of the scrawl. */}
			<div class="scenario">
				<form>
					<ink.root name="signature" required>
						<ink.label>Signature</ink.label>
						<ink.description>Sign on the line.</ink.description>
						<ink.area class="ink-surface">
							<ink.indicator />
						</ink.area>
						<ink.field />
					</ink.root>
					<textbox.root name="signed-name" required>
						<textbox.label>Type your name</textbox.label>
						<textbox.input />
					</textbox.root>
					<button type="submit">Sign</button>
				</form>
			</div>
		</section>

		<section id="pad">
			<h2>Pad</h2>
			<div class="scenario">
				<pad.root defaultValue={SHADOW}>
					<pad.label>Shadow offset</pad.label>
					<pad.description>Drag the handle, or move it with the arrow keys.</pad.description>
					<pad.area class="pad-plane">
						<pad.indicator class="pad-grid" />
						<pad.thumb class="pad-handle" />
					</pad.area>
					<pad.valuelabel />
					<pad.field name="offset" />
				</pad.root>
			</div>

			{/* Two control points in one pad: two tab stops, which is the claim a real reader is here to settle. */}
			<div class="scenario">
				<pad.root defaultValue={CONTROLS}>
					<pad.label>Easing curve</pad.label>
					<pad.area class="pad-plane">
						<CurveHandles />
					</pad.area>
					<pad.valuelabel />
				</pad.root>
			</div>
		</section>

		<section id="crop">
			<h2>Crop</h2>
			<div class="scenario">
				<crop.root name="crop" defaultValue={CROP_START}>
					<crop.label>Crop</crop.label>
					<crop.description>Drag the rectangle, or move it with the arrow keys. Each handle resizes one edge.</crop.description>
					<crop.area class="crop-area">
						<crop.selection class="crop-rect">
							<crop.indicator class="crop-grid" />
							<crop.thumb blockStart class="crop-handle" />
							<crop.thumb blockEnd class="crop-handle" />
							<crop.thumb inlineStart class="crop-handle" />
							<crop.thumb inlineEnd class="crop-handle" />
							<crop.thumb blockStart inlineStart class="crop-handle" />
							<crop.thumb blockStart inlineEnd class="crop-handle" />
							<crop.thumb blockEnd inlineStart class="crop-handle" />
							<crop.thumb blockEnd inlineEnd class="crop-handle" />
						</crop.selection>
					</crop.area>
					<crop.field />
				</crop.root>
			</div>
		</section>

		{/* The picture recipe gets its own section because the section a reader walks for the crop must serve the eight handles and nothing more; the corner handle here would be a ninth. The family knows nothing about bitmaps - the scale from area pixels to the picture's own pixels is the consumer's few lines below. */}
		<section id="crop-image">
			<h2>Crop over a picture</h2>
			<div class="scenario">
				<PhotoCrop />
			</div>
		</section>

		{/* The tour's targets are the section's own buttons, reached through handles the page mints: a step may not look its target up, and a handle only crosses a component edge as a bare prop. The tour ships no trigger part, so "Take the tour" is the page's own button flipping `open`. */}
		<section id="tour">
			<h2>Tour</h2>
			<div class="scenario">
				<TourSection />
			</div>
		</section>

		{/* The mixed bar is the shape worth reading: controls from three other families keep their own roles - button, switch, button - and share the bar's single tab stop, with no wrapper part around any of them. Each registers itself by reading the enclosing toolbar. */}
		<section id="toolbar">
			<h2>Toolbar</h2>
			<div class="scenario">
				<toolbar.root>
					<toolbar.label>Document</toolbar.label>

					<buttongroup.root value="left">
						<buttongroup.item value="left">Left</buttongroup.item>
						<buttongroup.item value="center">Center</buttongroup.item>
					</buttongroup.root>

					<toggle.root>
						<toggle.label>Wrap lines</toggle.label>
						<toggle.trigger><toggle.thumb /></toggle.trigger>
					</toggle.root>

					<select.root>
						<select.label>Font</select.label>
						<select.trigger>Serif</select.trigger>
						<select.content>
							<select.item value="serif">
								<select.itemlabel>Serif</select.itemlabel>
							</select.item>
							<select.item value="mono">
								<select.itemlabel>Mono</select.itemlabel>
							</select.item>
						</select.content>
					</select.root>

					<toolbar.item>Print</toolbar.item>
				</toolbar.root>
			</div>
		</section>

		<section id="drawer">
			<h2>Drawer</h2>
			<div class="scenario">
				<drawer.root>
					<drawer.trigger>Filter results</drawer.trigger>
					<drawer.backdrop>
						<drawer.content>
							<drawer.title>Narrow these results</drawer.title>
							<button type="button">Apply</button>
							<drawer.close>Cancel</drawer.close>
						</drawer.content>
					</drawer.backdrop>
				</drawer.root>
			</div>

			{/* A bottom sheet that rests half open before it rests fully open: the claim a real reader is here to settle is that the rest position changes nothing it announces. */}
			<div class="scenario">
				<drawer.root snapPoints={[0.5, 1]} defaultSnapPoint={0.5}>
					<drawer.trigger>Nearby stops</drawer.trigger>
					<drawer.backdrop>
						<drawer.content>
							<drawer.title>Where to next?</drawer.title>
							<drawer.close>Done</drawer.close>
						</drawer.content>
					</drawer.backdrop>
				</drawer.root>
			</div>

			{/* A drawer inside a drawer's surface is the same parts, and the inner root is its own instance. */}
			<div class="scenario">
				<drawer.root>
					<drawer.trigger>Payment method</drawer.trigger>
					<drawer.backdrop>
						<drawer.content>
							<drawer.title>Choose a payment method</drawer.title>
							<drawer.root>
								<drawer.trigger>Add a card</drawer.trigger>
								<drawer.backdrop>
									<drawer.content>
										<drawer.title>Card added</drawer.title>
										<drawer.close>OK</drawer.close>
									</drawer.content>
								</drawer.backdrop>
							</drawer.root>
							<drawer.close>Cancel</drawer.close>
						</drawer.content>
					</drawer.backdrop>
				</drawer.root>
			</div>
		</section>

		<section id="resizable">
			<h2>Resizable</h2>
			{/* The family ships the flex defaults but no size, so the group gets its own box and the divider something to grab, the way a consumer's stylesheet would. */}
			<div class="scenario">
				<resizable.root
					defaultSizes={{ nav: 30, main: 70 }}
					style="inline-size: 400px; block-size: 120px"
				>
					<resizable.item value="nav">Navigation</resizable.item>
					<resizable.thumb
						value="nav"
						min={10}
						max={80}
						aria-label="Resize navigation"
						style="inline-size: 8px; background: #ccc"
					/>
					<resizable.item value="main">Content</resizable.item>
				</resizable.root>
			</div>

			{/* A collapsible boundary: the claim a real reader is here to settle is that Enter shutting the panel to 5% is a value change it speaks, not a disappearance. */}
			<div class="scenario">
				<resizable.root
					defaultSizes={{ sidebar: 30, editor: 70 }}
					style="inline-size: 400px; block-size: 120px"
				>
					<resizable.item value="sidebar">Files</resizable.item>
					<resizable.thumb
						value="sidebar"
						min={15}
						max={60}
						collapsible={true}
						collapsedSize={5}
						aria-label="Resize files"
						style="inline-size: 8px; background: #ccc"
					/>
					<resizable.item value="editor">Editor</resizable.item>
				</resizable.root>
			</div>
		</section>

		<section id="timebox">
			<h2>Time box</h2>
			<div class="scenario">
				<timebox.root locale="en-US" name="starts">
					<timebox.label>Start time</timebox.label>
					<timebox.hourinput />
					<timebox.minuteinput />
					<timebox.dayperiodinput />
					<timebox.field />
				</timebox.root>
			</div>
		</section>

		{/* Its own anchor rather than a second scenario above: the boxes carry the
		    same names whatever the locale, so one section holding both would leave a
		    reader two "hour input" spinbuttons and no way to say which it walked. */}
		<section id="timebox-twelve-hour">
			<h2>Time box on a 12-hour clock</h2>
			<div class="scenario">
				<timebox.root locale="de-DE" hour12 value="14:30" name="endet">
					<timebox.label>Endzeit</timebox.label>
					<timebox.hourinput />
					<timebox.minuteinput />
					<timebox.dayperiodinput />
					<timebox.field />
				</timebox.root>
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

			<tour.item index={1} target={shareEl}>
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

// The marks are the consumer's own markup and sit inside the root, for the reason
// the month below carries. A construct may not be the direct child of a component
// tag either, so the repeat opens in a plain element.
function RatingMarks() @{
	const marks = rating.state();

	<div>
		@for (const position of marks.positions; key position) {
			<rating.item value={position}>
				<span aria-hidden="true">★</span>
			</rating.item>
		}
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

// The chips are the page's own markup over the page's own array, repeated inside
// the root. The array lives on a state OBJECT rather than a reassigned binding,
// because a repeat follows a property write; a construct may not be a component
// tag's direct child either, which is why the repeat opens in a plain element.
function TopicTags() @{
	const own = state({ tags: ['alpha', 'beta'] as readonly string[] });

	<taglist.root
		name="topics"
		value={own.tags}
		onChange={(next: readonly string[]) => {
			own.tags = next;
		}}
	>
		<taglist.label>Topics</taglist.label>
		<div role="presentation">
			@for (const tag of own.tags; key tag) {
				<taglist.item value={tag}>
					<taglist.itemlabel />
					<taglist.itemclose>×</taglist.itemclose>
				</taglist.item>
			}
		</div>
		<taglist.input placeholder="Add a topic" />
		<taglist.field />
	</taglist.root>
}

function FilterTags() @{
	const own = state({ tags: ['red', 'green', 'blue'] as readonly string[] });

	<taglist.root
		value={own.tags}
		onChange={(next: readonly string[]) => {
			own.tags = next;
		}}
	>
		<taglist.label>Active filters</taglist.label>
		<div role="presentation">
			@for (const tag of own.tags; key tag) {
				<taglist.item value={tag}>
					<taglist.itemlabel />
					<taglist.itemclose>×</taglist.itemclose>
				</taglist.item>
			}
		</div>
	</taglist.root>
}

function StageTags() @{
	const own = state({ tags: ['draft', 'review'] as readonly string[] });

	<taglist.root
		editable
		value={own.tags}
		onChange={(next: readonly string[]) => {
			own.tags = next;
		}}
	>
		<taglist.label>Stages</taglist.label>
		<div role="presentation">
			@for (const tag of own.tags; key tag) {
				<taglist.item value={tag}>
					<taglist.itemlabel />
					<taglist.iteminput />
					<taglist.itemclose>×</taglist.itemclose>
				</taglist.item>
			}
		</div>
		<taglist.input />
	</taglist.root>
}

const SHADOW = [{ id: 'offset', x: 0.25, y: 0.75 }];
const CONTROLS = [
	{ id: 'p1', x: 0.25, y: 0.1 },
	{ id: 'p2', x: 0.75, y: 0.9 },
];

// The curve is the page's own drawing: the family holds two points and knows
// nothing about easing.
function curvePath(points: readonly PadPoint[]): string {
	const first = points[0] ?? { id: 'p1', x: 0, y: 0 };
	const second = points[1] ?? { id: 'p2', x: 1, y: 1 };
	return `M 0 100 C ${first.x * 100} ${100 - first.y * 100} ${second.x * 100} ${100 - second.y * 100} 100 0`;
}

// A component that reads the pad's state is a part of that pad's widget, so it
// sits inside the root; a construct may not be a component tag's direct child
// either, which is why the repeat opens in a plain element.
function CurveHandles() @{
	const held = pad.state();
	const drawn = computed(() => curvePath(held.points));

	<div style="display: contents">
		<svg class="pad-curve" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
			<path d={drawn} fill="none" stroke="currentColor" />
		</svg>
		@for (const point of held.points; key point.id) {
			<pad.thumb value={point} class="pad-handle" />
		}
	</div>
}

const CROP_START = { x: 40, y: 30, width: 200, height: 150 };

// An 800×600 picture shown at 400×300, so the scale from area pixels to the
// picture's own pixels is exactly 2. Inline, so the gallery serves no asset.
const PHOTO =
	'data:image/svg+xml;charset=utf-8,' +
	encodeURIComponent(
		'<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">' +
			'<rect width="800" height="600" fill="#4a6"/>' +
			'<rect x="200" y="150" width="400" height="300" fill="#136"/>' +
			'</svg>',
	);

function PhotoCrop() @{
	const picture = element<HTMLImageElement>();
	const sheet = element<HTMLCanvasElement>();
	let cut = state('');

	<div style="display: contents">
		<crop.root
			name="photo"
			defaultValue={CROP_START}
			onChange={(rect) => {
				const shown = picture;
				const board = sheet;
				if (!shown || !board) return;

				const scale = shown.naturalWidth / shown.clientWidth;
				const x = Math.round(rect.x * scale);
				const y = Math.round(rect.y * scale);
				const width = Math.round(rect.width * scale);
				const height = Math.round(rect.height * scale);
				board.setAttribute('width', String(width));
				board.setAttribute('height', String(height));
				board.getContext('2d')?.drawImage(shown, x, y, width, height, 0, 0, width, height);
				cut = `${x}, ${y}, ${width}×${height}`;
			}}
		>
			<crop.label>Photo</crop.label>
			<crop.description>Drag the rectangle over the picture, or move it with the arrow keys.</crop.description>
			<crop.area class="crop-area">
				<img el={picture} src={PHOTO} alt="" class="crop-picture" />
				<crop.selection class="crop-rect">
					<crop.thumb blockEnd inlineEnd class="crop-handle" />
				</crop.selection>
			</crop.area>
			<crop.field />
		</crop.root>
		<p>Cut in the picture's own pixels: <output>{cut}</output></p>
		<canvas el={sheet} />
	</div>
}
