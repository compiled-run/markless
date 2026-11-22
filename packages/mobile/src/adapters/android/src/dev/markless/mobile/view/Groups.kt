package dev.markless.mobile.view

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.ColorFilter
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.Rect
import android.graphics.drawable.Drawable
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import android.widget.FrameLayout
import dev.markless.mobile.style.StyleWrite
import dev.markless.mobile.style.TransformLength
import java.lang.reflect.InvocationTargetException
import java.lang.reflect.Method
import java.nio.ByteBuffer

private fun dragon(name: String): Class<*> = Class.forName("dev.dragon.layout.$name")
private val D: Class<*> = java.lang.Double.TYPE

private fun Method.call(vararg args: Any?): Any? = try {
	invoke(null, *args)
} catch (e: InvocationTargetException) {
	throw e.cause ?: e
}

/** Dragon's translated paint-transform.ts, found by name when the app is built with Dragon's engine. */
internal class DragonTransforms private constructor() {
	private val length = dragon("LengthValue")
	private val newLength = length.getConstructor(String::class.java, D, D)
	private val newOp = dragon("TransformOp").getConstructor(String::class.java, length, length, D, D, D)
	private val origin = dragon("TransformOrigin")
	private val newOrigin = origin.getConstructor(length, length)
	private val trig = dragon("Trig")
	/** The platform's sin and cos for the translated gfx::SinCosDegrees. */
	private val platformTrig = trig.getConstructor(Function1::class.java, Function1::class.java).newInstance({ x: Double -> kotlin.math.sin(x) }, { x: Double -> kotlin.math.cos(x) })
	private val functionsMatrix = dragon("PaintTransformKt").getMethod("paintTransform_transformFunctionsMatrix", java.util.ArrayList::class.java, D, D, trig)
	private val resolveOrigin = dragon("PaintTransformKt").getMethod("paintTransform_resolveTransformOrigin", origin, D, D)
	private val matrix = dragon("Matrix2D").let { m -> listOf("getA", "getB", "getC", "getD", "getE", "getF").map { m.getMethod(it) } }
	private val point = dragon("OriginPoint").let { p -> listOf(p.getMethod("getX"), p.getMethod("getY")) }

	private fun length(l: TransformLength): Any = newLength.newInstance(l.kind, l.px, l.percent)

	/** The functions' matrix [a, b, c, d, e, f] at a border box of [width] x [height] CSS px, and the resolved origin [x, y]. */
	fun resolve(t: StyleWrite.Transform, width: Double, height: Double): Pair<DoubleArray, DoubleArray> {
		val ops = java.util.ArrayList<Any>(t.functions.map { newOp.newInstance(it.fn, length(it.x), length(it.y), it.angle, it.sx, it.sy) })
		val m = functionsMatrix.call(ops, width, height, platformTrig)
		val o = resolveOrigin.call(newOrigin.newInstance(length(t.originX), length(t.originY)), width, height)
		return DoubleArray(6) { matrix[it].invoke(m) as Double } to DoubleArray(2) { point[it].invoke(o) as Double }
	}

	companion object {
		val linked: DragonTransforms? = try { DragonTransforms() } catch (_: ReflectiveOperationException) { null }
	}
}

/** Dragon's translated paint.ts alpha byte and paint-group.ts composites, found by name when the app is built with Dragon's engine. */
internal class DragonComposite private constructor() {
	private val alpha8 = dragon("PaintKt").getMethod("paint_opacityAlpha8", D)
	private val composite = dragon("PaintGroupKt").getMethod("paintGroup_groupComposite", D, D, D, D, D, D, D, D, D, java.lang.Boolean.TYPE)
	private val layered = dragon("PaintGroupKt").getMethod("paintGroup_groupCompositeLayered", D, D, D, D, D, D, D, D, D)

	fun alpha8(opacity: Double): Double = alpha8.call(opacity) as Double

	/** One pixel of a group's layer over its backdrop (premultiplied RGBA bytes), packed r | g << 8 | b << 16 | a << 24; never folded. */
	fun composite(l: ByteArray, b: ByteArray, i: Int, a8: Double, inLayer: Boolean): Double {
		fun u(x: Byte) = (x.toInt() and 0xff).toDouble()
		return if (inLayer) layered.call(u(l[i]), u(l[i + 1]), u(l[i + 2]), u(l[i + 3]), u(b[i]), u(b[i + 1]), u(b[i + 2]), u(b[i + 3]), a8) as Double
		else composite.call(u(l[i]), u(l[i + 1]), u(l[i + 2]), u(l[i + 3]), u(b[i]), u(b[i + 1]), u(b[i + 2]), u(b[i + 3]), a8, false) as Double
	}

	companion object {
		val linked: DragonComposite? = try { DragonComposite() } catch (_: ReflectiveOperationException) { null }
	}
}

/**
 * A box's transform in device px: Dragon's functions matrix as a rotation times an axis-aligned scale, set as the View's pivot
 * (the origin), translation, rotation and scale; RenderNode composes T(translation) · T(pivot) · R · S · T(-pivot).
 */
internal fun applyTransform(id: String, view: View, t: StyleWrite.Transform?, widthPx: Double, heightPx: Double, dpr: Double) {
	if (t == null || t.functions.isEmpty()) {
		view.translationX = 0f
		view.translationY = 0f
		view.rotation = 0f
		view.scaleX = 1f
		view.scaleY = 1f
		return
	}
	val paint = DragonTransforms.linked ?: throw MarklessHostError("\"$id\": a transform needs Dragon's paint functions, which this app does not link")
	val (m, o) = paint.resolve(t, widthPx / dpr, heightPx / dpr)
	val (a, b, c, d) = listOf(m[0], m[1], m[2], m[3])
	if (Math.abs(a * c + b * d) > 1e-9 * (a * a + b * b + c * c + d * d)) throw MarklessHostError("\"$id\": a skewed transform, which Android's view transform cannot draw")
	val sx = Math.hypot(a, b)
	val sy: Double
	val degrees: Double
	if (sx > 0.0) {
		sy = (a * d - b * c) / sx
		degrees = Math.toDegrees(Math.atan2(b, a))
	} else {
		sy = Math.hypot(c, d)
		degrees = if (sy > 0.0) Math.toDegrees(Math.atan2(-c, d)) else 0.0
	}
	view.pivotX = (o[0] * dpr).toFloat()
	view.pivotY = (o[1] * dpr).toFloat()
	view.translationX = (m[4] * dpr).toFloat()
	view.translationY = (m[5] * dpr).toFloat()
	view.rotation = degrees.toFloat()
	view.scaleX = sx.toFloat()
	view.scaleY = sy.toFloat()
}

/** A view group that leaves out the views a group's backdrop capture skips. */
internal interface SkipsBackdrop

/** The views a backdrop capture leaves out: the group and everything drawn after it; empty outside a capture. */
internal object Backdrop {
	var skip: Set<View> = emptySet()
}

/** A full-screen top layer (a dialog's or a modal overlay's) that a group's backdrop capture can draw without what paints after the group. */
class TopLayer(context: Context) : FrameLayout(context), SkipsBackdrop {
	override fun drawChild(canvas: Canvas, child: View, drawingTime: Long): Boolean =
		if (child in Backdrop.skip) false else super.drawChild(canvas, child, drawingTime)
}

/** The children of [parent] drawn after [child], in the order [parent] draws them. */
internal fun drawnAfter(parent: ViewGroup, child: View): List<View> =
	if (parent is MarklessBox) parent.drawnAfter(child) else (parent.indexOfChild(child) + 1 until parent.childCount).map(parent::getChildAt)

/** What a group overlay reads from the page it is in. */
internal class GroupContext(
	/** The view the group's backdrop is drawn from, and what shows under it (the canvas, body), drawn in its coordinates. */
	val backdropRoot: (View) -> Pair<View, (Canvas) -> Unit>,
	/** Whether the page's boxes reach past the viewport, so Chrome's root scroller overflows. */
	val rootOverflows: () -> Boolean,
	/** The overlay of an earlier group, by Dragon id, seen from the group with this instance id. */
	val overlay: (painter: String, from: String) -> GroupOverlay?,
	/** The view of an element, by Dragon id, seen from the group with this instance id. */
	val view: (id: String, from: String) -> View?,
	val overlays: () -> List<GroupOverlay>,
)

/**
 * A pre-composited opacity group's overlay: a drawable over the group's view, drawing in a bitmap at the group's extent the
 * platform's drawing of the group composited over what the platform draws before it, by Dragon's translated composite.
 * It recomputes in the pre-draw pass after it is marked stale, and draws nothing while the group is drawn into its layer.
 */
internal class GroupOverlay(
	val id: String,
	val view: View,
	val group: StyleWrite.OpacityGroup,
	val alpha8: Double,
	private val paint: DragonComposite,
	private val context: GroupContext,
) : Drawable(), ViewTreeObserver.OnPreDrawListener, View.OnAttachStateChangeListener {
	private var dirty = true
	/** Whether this group has warned that unstable earlier paint lies under it. */
	private var warnedUnstable = false
	private var skipping = false
	private var bitmap: Bitmap? = null
	/** Where the composite draws, relative to the view, in device px. */
	private val at = Rect()
	private val bitmapPaint = Paint().apply { isFilterBitmap = false; isDither = false; isAntiAlias = false }
	private var observer: ViewTreeObserver? = null

	init {
		view.overlay.add(this)
		view.addOnAttachStateChangeListener(this)
		if (view.isAttachedToWindow) onViewAttachedToWindow(view)
	}

	fun remove() {
		view.overlay.remove(this)
		view.removeOnAttachStateChangeListener(this)
		onViewDetachedFromWindow(view)
		bitmap?.recycle()
		bitmap = null
	}

	override fun onViewAttachedToWindow(v: View) {
		observer = v.viewTreeObserver.also { it.addOnPreDrawListener(this) }
	}

	override fun onViewDetachedFromWindow(v: View) {
		observer?.takeIf { it.isAlive }?.removeOnPreDrawListener(this)
		observer = null
	}

	fun markDirty() {
		if (computing > 0) return
		dirty = true
		view.invalidate()
	}

	/** Once per frame, after layout: recompute when stale; a frame that changed the composite is drawn again with it. */
	override fun onPreDraw(): Boolean {
		if (!dirty) return true
		computeIfNeeded()
		return false
	}

	override fun draw(canvas: Canvas) {
		if (skipping) return
		val b = bitmap ?: return
		canvas.drawBitmap(b, at.left.toFloat(), at.top.toFloat(), bitmapPaint)
	}

	override fun setAlpha(alpha: Int) {}
	override fun setColorFilter(colorFilter: ColorFilter?) {}
	@Deprecated("Drawable.getOpacity is deprecated")
	override fun getOpacity(): Int = PixelFormat.TRANSLUCENT

	/** Recomputes the composite when stale; an earlier group's is computed first when this one's backdrop shows it. */
	fun computeIfNeeded() {
		if (!dirty || view.parent == null) return
		dirty = false
		computing++
		try {
			compute()
		} finally {
			computing--
		}
		for (later in context.overlays()) if (later !== this && later.group.painters.any { context.overlay(it, later.id) === this }) later.markDirty()
	}

	private fun compute() {
		val (root, under) = context.backdropRoot(view)
		val go = layoutOffset(view, root)
		// The extent: the group's box and every view inside it (each draws inside its own bounds), clamped to the root.
		var ext = intArrayOf(go[0], go[1], go[0] + view.width, go[1] + view.height)
		fun grow(v: ViewGroup) {
			for (i in 0 until v.childCount) {
				val c = v.getChildAt(i)
				if (c.visibility != View.VISIBLE) continue
				val o = layoutOffset(c, root)
				ext = intArrayOf(minOf(ext[0], o[0]), minOf(ext[1], o[1]), maxOf(ext[2], o[0] + c.width), maxOf(ext[3], o[1] + c.height))
				if (c is ViewGroup) grow(c)
			}
		}
		if (view is ViewGroup) grow(view)
		ext = intArrayOf(maxOf(ext[0], 0), maxOf(ext[1], 0), minOf(ext[2], root.width), minOf(ext[3], root.height))
		val w = ext[2] - ext[0]
		val h = ext[3] - ext[1]
		val old = bitmap
		if (w <= 0 || h <= 0) {
			bitmap = null
			old?.recycle()
			view.invalidate()
			return
		}
		// L: the platform's drawing of the group's view and everything in it, this overlay left out.
		val lp = ByteArray(w * h * 4)
		Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888).let { layer ->
			val canvas = Canvas(layer)
			canvas.translate((go[0] - ext[0]).toFloat(), (go[1] - ext[1]).toFloat())
			skipping = true
			try { view.draw(canvas) } finally { skipping = false }
			layer.copyPixelsToBuffer(ByteBuffer.wrap(lp))
			layer.recycle()
		}
		for (painter in group.painters) context.overlay(painter, id)?.computeIfNeeded()
		// The group's transform to the root, from the platform: its layout offset plus its view matrix.
		val gm = view.matrix
		val transformed = !gm.isIdentity
		fun toRoot(x: Float, y: Float): FloatArray {
			val pt = floatArrayOf(x, y)
			gm.mapPoints(pt)
			return floatArrayOf(go[0] + pt[0], go[1] + pt[1])
		}
		var bext = ext
		if (transformed) {
			val cs = listOf(ext[0] to ext[1], ext[2] to ext[1], ext[2] to ext[3], ext[0] to ext[3]).map { (x, y) -> toRoot((x - go[0]).toFloat(), (y - go[1]).toFloat()) }
			bext = intArrayOf(
				maxOf(Math.floor(cs.minOf { it[0].toDouble() }).toInt(), 0), maxOf(Math.floor(cs.minOf { it[1].toDouble() }).toInt(), 0),
				minOf(Math.ceil(cs.maxOf { it[0].toDouble() }).toInt(), root.width), minOf(Math.ceil(cs.maxOf { it[1].toDouble() }).toInt(), root.height),
			)
		}
		// Earlier paint Dragon marks unstable (its capture may differ from the screen) under the group: warned once, still drawn.
		if (!warnedUnstable) for (painter in group.unstable) {
			val v = context.view(painter, id) ?: continue
			if (generateSequence(v.parent) { it.parent }.none { it === root }) continue
			val o = layoutOffset(v, root)
			if (o[0] < bext[2] && bext[0] < o[0] + v.width && o[1] < bext[3] && bext[1] < o[1] + v.height) {
				warnedUnstable = true
				android.util.Log.w(MarklessHost.TAG, "opacity group \"$id\" is drawn over \"$painter\", whose capture may differ from the screen")
				break
			}
		}
		// B: the platform's drawing of what paints before the group, the group and every view drawn after it left out.
		val bw = maxOf(bext[2] - bext[0], 0)
		val bh = maxOf(bext[3] - bext[1], 0)
		val bb = ByteArray(bw * bh * 4) { 255.toByte() }
		if (bw > 0 && bh > 0) {
			val skip = java.util.Collections.newSetFromMap(java.util.IdentityHashMap<View, Boolean>())
			var v: View = view
			while (v !== root) {
				val p = v.parent as? ViewGroup ?: throw MarklessHostError("\"$id\"'s opacity group is not inside the view its backdrop is drawn from")
				val left = (if (v === view) listOf(v) else emptyList()) + drawnAfter(p, v)
				if (left.isNotEmpty() && p !is SkipsBackdrop) throw MarklessHostError("\"$id\"'s opacity group is inside a ${p.javaClass.simpleName}, which cannot leave it out of its backdrop")
				skip.addAll(left)
				v = p
			}
			Bitmap.createBitmap(bw, bh, Bitmap.Config.ARGB_8888).let { backdrop ->
				val canvas = Canvas(backdrop)
				canvas.translate(-bext[0].toFloat(), -bext[1].toFloat())
				under(canvas)
				if (view !== root) {
					Backdrop.skip = skip
					try { root.draw(canvas) } finally { Backdrop.skip = emptySet() }
				}
				backdrop.copyPixelsToBuffer(ByteBuffer.wrap(bb))
				backdrop.recycle()
			}
		}
		// B in the group's local device px: the pixel under each local pixel centre once the platform maps the overlay.
		val bp: ByteArray
		if (!transformed) {
			bp = bb
		} else {
			bp = ByteArray(w * h * 4) { 255.toByte() }
			val o = toRoot(0f, 0f); val ux = toRoot(1f, 0f); val uy = toRoot(0f, 1f)
			val ax = (ux[0] - o[0]).toDouble(); val bx = (ux[1] - o[1]).toDouble(); val cx = (uy[0] - o[0]).toDouble(); val dx = (uy[1] - o[1]).toDouble()
			for (y in 0 until h) {
				for (x in 0 until w) {
					val lx = ext[0] - go[0] + x + 0.5
					val ly = ext[1] - go[1] + y + 0.5
					val px = Math.floor(o[0] + ax * lx + cx * ly).toInt() - bext[0]
					val py = Math.floor(o[1] + bx * lx + dx * ly).toInt() - bext[1]
					if (px < 0 || py < 0 || px >= bw || py >= bh) continue
					val i = (y * w + x) * 4
					val j = (py * bw + px) * 4
					for (k in 0 until 4) bp[i + k] = bb[j + k]
				}
			}
		}
		// Q: clear where the group drew nothing, else Dragon's composite; a group after a sticky box on a page that scrolls is layered.
		val inLayer = group.after != null && context.rootOverflows()
		val q = ByteArray(w * h * 4)
		// The composite is a pure function of the two pixels: each distinct pair is reached through reflection once.
		val seen = HashMap<Long, Long>()
		for (i in 0 until w * h * 4 step 4) {
			if (lp[i + 3].toInt() == 0) continue
			var key = 0L
			for (k in 0 until 4) key = (key shl 8) or (lp[i + k].toLong() and 0xff)
			for (k in 0 until 4) key = (key shl 8) or (bp[i + k].toLong() and 0xff)
			val v = seen.getOrPut(key) {
				val packed = paint.composite(lp, bp, i, alpha8, inLayer)
				if (packed < 0 || packed > 4294967295.0 || packed != Math.rint(packed)) throw MarklessHostError("Dragon's composite gave $packed, not a packed pixel")
				packed.toLong()
			}
			q[i] = (v and 0xffL).toByte(); q[i + 1] = ((v shr 8) and 0xffL).toByte(); q[i + 2] = ((v shr 16) and 0xffL).toByte(); q[i + 3] = ((v shr 24) and 0xffL).toByte()
		}
		bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888).also { it.copyPixelsFromBuffer(ByteBuffer.wrap(q)) }
		old?.recycle()
		at.set(ext[0] - go[0], ext[1] - go[1], ext[2] - go[0], ext[3] - go[1])
		bounds = at
		view.invalidate()
	}

	companion object {
		/** How deep a composite is running: a composite's own drawing marks nothing stale. */
		var computing = 0
	}
}

/** A view's layout offset in device px from [root]'s top left, in its parents' scrolled content; transforms are not applied. */
internal fun layoutOffset(v: View, root: View): IntArray {
	var x = 0
	var y = 0
	var c = v
	while (c !== root) {
		val p = c.parent as? View ?: throw MarklessHostError("a group's view is not inside the view its backdrop is drawn from")
		x += c.left - p.scrollX
		y += c.top - p.scrollY
		c = p
	}
	return intArrayOf(x, y)
}
