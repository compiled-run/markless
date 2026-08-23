import * as radiogroup from '../index.ts';

// A segmented control is not another family: it is this one, laid out sideways.
// The only difference from `basic.tsrx` is `orientation`, which is what decides
// the arrow axis as well as what the styling hangs off.
export function SegmentedControl() @{
	<radiogroup.root orientation="horizontal" value="week" data-testid="root">
		<radiogroup.label data-testid="label">Range</radiogroup.label>
		<radiogroup.item value="day" data-testid="day">
			<radiogroup.itemfield data-testid="day-field" />
			<radiogroup.itemtrigger data-testid="day-trigger">
				<radiogroup.itemindicator data-testid="day-indicator">Chosen</radiogroup.itemindicator>
			</radiogroup.itemtrigger>
			<radiogroup.itemlabel data-testid="day-label">Day</radiogroup.itemlabel>
		</radiogroup.item>
		<radiogroup.item value="week" data-testid="week">
			<radiogroup.itemfield data-testid="week-field" />
			<radiogroup.itemtrigger data-testid="week-trigger">
				<radiogroup.itemindicator data-testid="week-indicator">Chosen</radiogroup.itemindicator>
			</radiogroup.itemtrigger>
			<radiogroup.itemlabel data-testid="week-label">Week</radiogroup.itemlabel>
		</radiogroup.item>
		<radiogroup.item value="month" data-testid="month">
			<radiogroup.itemfield data-testid="month-field" />
			<radiogroup.itemtrigger data-testid="month-trigger">
				<radiogroup.itemindicator data-testid="month-indicator">Chosen</radiogroup.itemindicator>
			</radiogroup.itemtrigger>
			<radiogroup.itemlabel data-testid="month-label">Month</radiogroup.itemlabel>
		</radiogroup.item>
	</radiogroup.root>
}
