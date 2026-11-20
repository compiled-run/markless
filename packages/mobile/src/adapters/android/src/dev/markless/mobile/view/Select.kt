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

	/** The control font size Chrome gives a select's text, in px. */
	fun textSize(px: Float) = display.setTextSize(android.util.TypedValue.COMPLEX_UNIT_PX, px)

	/** Chrome's unstyled look inside the field-like box the host draws: its text in [color] and a chevron after it. */
	fun chromeLook(color: Int, density: Float) {
		display.setTextColor(color)
		display.setCompoundDrawablesRelativeWithIntrinsicBounds(null, null, Chevron(color, density), null)
		display.compoundDrawablePadding = (4 * density).toInt()
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

/** The chevron Chrome draws at the end of a closed select: a 7 by 4 px open V in the text's colour. */
private class Chevron(private val color: Int, private val density: Float) : android.graphics.drawable.Drawable() {
	private val paint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
		style = android.graphics.Paint.Style.STROKE
		strokeWidth = 1.5f * density
		strokeCap = android.graphics.Paint.Cap.ROUND
	}
	override fun getIntrinsicWidth() = (9 * density).toInt()
	override fun getIntrinsicHeight() = (6 * density).toInt()
	override fun draw(canvas: android.graphics.Canvas) {
		paint.color = color
		val b = bounds
		val path = android.graphics.Path().apply {
			moveTo(b.left + density, b.top + density)
			lineTo(b.exactCenterX(), b.bottom - density)
			lineTo(b.right - density, b.top + density)
		}
		canvas.drawPath(path, paint)
	}
	override fun setAlpha(alpha: Int) { paint.alpha = alpha }
	override fun setColorFilter(colorFilter: android.graphics.ColorFilter?) { paint.colorFilter = colorFilter }
	@Deprecated("Deprecated in Java") override fun getOpacity() = android.graphics.PixelFormat.TRANSLUCENT
}
