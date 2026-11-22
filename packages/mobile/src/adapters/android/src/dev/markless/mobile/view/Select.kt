package dev.markless.mobile.view

import android.app.AlertDialog
import android.content.Context
import android.graphics.Canvas
import android.graphics.ColorFilter
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PixelFormat
import android.graphics.Rect
import android.graphics.Typeface
import android.graphics.drawable.Drawable
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.TextView
import dev.markless.mobile.style.SelectArrow

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

	/** On a styled page: the label at [box] (px from the select), vertically centred, with no system arrow; Dragon's arrow is the background's. */
	internal fun label(box: Rect?, typeface: Typeface?, sizePx: Double, color: Int?) {
		display.setCompoundDrawablesRelativeWithIntrinsicBounds(0, 0, 0, 0)
		display.visibility = if (box == null) View.GONE else View.VISIBLE
		if (box == null) return
		frames[display] = box
		display.gravity = Gravity.CENTER_VERTICAL or Gravity.START
		display.isSingleLine = true
		display.ellipsize = null
		display.paintFlags = display.paintFlags or Paint.SUBPIXEL_TEXT_FLAG or Paint.LINEAR_TEXT_FLAG
		display.typeface = typeface
		display.setTextSize(TypedValue.COMPLEX_UNIT_PX, sizePx.toFloat())
		color?.let { display.setTextColor(it) }
		requestLayout()
	}
}

/** A select's drop-down arrow as Chrome strokes a menulist-button's: the select's rounded frame is its snapped border box. */
class MenuListArrow(private val arrow: SelectArrow, color: Int) : Drawable() {
	private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
		style = Paint.Style.STROKE
		strokeWidth = arrow.strokeWidth.toFloat()
		strokeCap = Paint.Cap.BUTT
		strokeJoin = Paint.Join.MITER
		strokeMiter = 4f
		this.color = color
	}

	override fun draw(canvas: Canvas) {
		val p = arrow.points
		val path = Path().apply {
			moveTo(bounds.left + p[0].toFloat(), bounds.top + p[1].toFloat())
			for (k in 2 until p.size step 2) lineTo(bounds.left + p[k].toFloat(), bounds.top + p[k + 1].toFloat())
		}
		canvas.drawPath(path, paint)
	}

	override fun setAlpha(alpha: Int) {}
	override fun setColorFilter(colorFilter: ColorFilter?) {}
	@Deprecated("Deprecated in Java")
	override fun getOpacity(): Int = PixelFormat.TRANSLUCENT
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
