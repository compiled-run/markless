import {
	checkbox,
	checklist,
	modal,
	progress,
	radiogroup,
	select,
	tabs,
	textbox,
	toggle,
} from '@markless/ui';

// Every shipped family's Basic scenario - the starter a consumer copies - on one
// page, each in a section a reader can jump to by its anchor: /#checkbox,
// /#toggle, /#textbox, /#progress, /#checklist, /#select, /#modal,
// /#radio-group, /#tabs.
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
					<progress.label>Export data 30%</progress.label>
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
	</main>
}
