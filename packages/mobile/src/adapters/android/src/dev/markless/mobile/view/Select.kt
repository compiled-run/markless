package dev.markless.mobile.view

import android.app.AlertDialog
import android.content.Context
import android.view.View
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.TextView

/** A closed `<select>`: its chosen option's label; a press opens the list of its options. */
class SelectBox(context: Context) : MarklessBox(context) {
	private val display = TextView(context).apply {
		includeFontPadding = false
		isClickable = false
		isFocusable = false
		importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
		setCompoundDrawablesRelativeWithIntrinsicBounds(0, 0, android.R.drawable.arrow_down_float, 0)
	}

	init {
		isClickable = true
		isFocusable = true
		addView(display)
	}

	fun show(label: String) {
		display.text = label
		stateDescription = label
	}
}

/** The list a select opens, as Chrome on Android shows one: a dialog of its options, the chosen one marked. */
fun View.choose(labels: List<String>, disabled: List<Boolean>, checked: Int, onPick: (Int) -> Unit) {
	val adapter = object : ArrayAdapter<String>(context, android.R.layout.simple_list_item_single_choice, labels) {
		override fun areAllItemsEnabled() = false
		override fun isEnabled(position: Int) = !disabled[position]
		override fun getView(position: Int, convertView: View?, parent: ViewGroup): View =
			super.getView(position, convertView, parent).apply { isEnabled = !disabled[position] }
	}
	AlertDialog.Builder(context)
		.setSingleChoiceItems(adapter, checked) { dialog, which ->
			dialog.dismiss()
			if (!disabled[which]) onPick(which)
		}
		.show()
}
