package dev.markless.mobile.view

import android.content.Context
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import androidx.core.widget.NestedScrollView
import com.google.android.material.bottomsheet.BottomSheetBehavior
import com.google.android.material.bottomsheet.BottomSheetDialog
import com.google.android.material.bottomsheet.BottomSheetDragHandleView
import dev.markless.mobile.core.Node

/**
 * One `<native.sheet>`: Material's [BottomSheetDialog] around the sheet's content views, which the host builds at mount and
 * keeps while it is closed. The dialog is themed with Material 3's light bottom sheet theme over the host's context.
 */
internal class SystemSheet(context: Context, private val node: Node.Sheet, content: MarklessBox, private val closedByPlatform: () -> Unit) {
	private val dialog = BottomSheetDialog(context, com.google.android.material.R.style.Theme_Material3_Light_BottomSheetDialog)
	private val twoHeights = node.snapPoints.size == 2

	init {
		if (!node.modal) throw MarklessHostError("\"${node.id}\" is a sheet with modal false; Android builds modal sheets only")
		val scroll = NestedScrollView(dialog.context).apply {
			isFillViewport = true
			addView(content, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
		}
		val body = if (!twoHeights) scroll else LinearLayout(dialog.context).apply {
			orientation = LinearLayout.VERTICAL
			addView(BottomSheetDragHandleView(dialog.context), LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
			addView(scroll, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
		}
		dialog.setContentView(body, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
		// Snap points are fractions of the screen, so the sheet is screen-tall and its resting heights are offsets.
		dialog.findViewById<FrameLayout>(com.google.android.material.R.id.design_bottom_sheet)!!.layoutParams.height = ViewGroup.LayoutParams.MATCH_PARENT
		dialog.setCancelable(node.dismissible)
		dialog.setCanceledOnTouchOutside(node.dismissible)
		dialog.behavior.apply {
			skipCollapsed = true
			isHideable = node.dismissible
			if (twoHeights) {
				isFitToContents = false
				halfExpandedRatio = node.snapPoints[0].toFloat()
			}
		}
		dialog.window!!.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
		dialog.setOnShowListener { dialog.behavior.state = if (twoHeights) BottomSheetBehavior.STATE_HALF_EXPANDED else BottomSheetBehavior.STATE_EXPANDED }
		dialog.setOnCancelListener { closedByPlatform() }
	}

	val showing: Boolean get() = dialog.isShowing

	fun open() {
		if (!dialog.isShowing) dialog.show()
	}

	/** The page closed it: no `dismiss` action follows. */
	fun close() {
		if (dialog.isShowing) dialog.dismiss()
	}
}
