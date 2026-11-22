package dev.markless.mobile.view

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Rect
import android.graphics.RectF
import android.view.View
import dev.markless.mobile.style.BorderOp
import dev.markless.mobile.style.OutlinePaint
import java.lang.reflect.InvocationTargetException
import java.lang.reflect.Method

/**
 * A box's outline as Dragon's DragonOutlineView draws it: each ring filled even-odd in the outline colour, or a dotted, dashed or
 * 3D outline's side-painter operations. It sits in its host's box among the children, drawn after the flow children and before
 * the boxes the stacking context paints later (order keys between 0 and their 100_001), each box's descendants' outlines first.
 */
class OutlineView(context: Context) : View(context) {
	var drawn: OutlinePaint? = null
		private set
	/** 24 numbers per ring in device px: outer and inner rect relative to the view, then their radii. */
	private var rings = DoubleArray(0)
	private var ops: List<BorderOp> = emptyList()
	private var originX = 0.0
	private var originY = 0.0
	private val paint = Paint(Paint.ANTI_ALIAS_FLAG)

	init {
		importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
		isClickable = false
		isFocusable = false
	}

	/** Takes the outline's rings and operations; returns the first ring's outer rect in page device px, which the view fills. */
	fun apply(outline: OutlinePaint): Rect {
		if (outline != drawn) {
			val geometry = OutlineGeometry.dragon ?: throw MarklessHostError("an outline is drawn by Dragon's translated painters, which this build does not link")
			val (all, painted) = geometry.of(outline)
			val bx = all[0]
			val by = all[1]
			rings = DoubleArray(all.size) { k -> if (k % 24 < 8) all[k] - (if (k % 2 == 0) bx else by) else all[k] }
			ops = painted
			originX = bx
			originY = by
			drawn = outline
			invalidate()
		}
		return Rect(Math.floor(originX).toInt(), Math.floor(originY).toInt(), Math.ceil(originX + rings[2]).toInt(), Math.ceil(originY + rings[3]).toInt())
	}

	override fun onDraw(canvas: Canvas) {
		super.onDraw(canvas)
		val outline = drawn ?: return
		// The view sits at the floor of the ring's outer rect; the rings keep their fraction of a device px.
		val dx = (originX - Math.floor(originX)).toFloat()
		val dy = (originY - Math.floor(originY)).toFloat()
		if (ops.isNotEmpty()) {
			canvas.save()
			canvas.translate(dx, dy)
			drawBorderOps(canvas, ops, outline.tones.map { it.argb }, -originX, -originY, Paint())
			canvas.restore()
			return
		}
		paint.style = Paint.Style.FILL
		paint.color = outline.color.argb
		var k = 0
		while (k + 24 <= rings.size) {
			val path = Path()
			path.fillType = Path.FillType.EVEN_ODD
			path.addPath(roundedRect(k, k + 8, dx, dy))
			path.addPath(roundedRect(k + 4, k + 16, dx, dy))
			canvas.drawPath(path, paint)
			k += 24
		}
	}

	/** Dragon's dragonRRectPath: the rect at [rect] and its corner radii (four x, then four y) at [radii], in device px. */
	private fun roundedRect(rect: Int, radii: Int, dx: Float, dy: Float): Path {
		val a = FloatArray(8)
		for (c in 0 until 4) {
			val x = rings[radii + c]
			val y = rings[radii + c + 4]
			if (x > 0.0 && y > 0.0) {
				a[2 * c] = x.toFloat()
				a[2 * c + 1] = y.toFloat()
			}
		}
		val r = RectF(rings[rect].toFloat() + dx, rings[rect + 1].toFloat() + dy, rings[rect + 2].toFloat() + dx, rings[rect + 3].toFloat() + dy)
		return Path().apply { addRoundRect(r, a, Path.Direction.CW) }
	}
}

/**
 * Dragon's translated paint-radius.ts (roundedShape, the outline's snapped width and truncated offset, outlineRings) and paint-dash.ts
 * (outlinePaintOps), found by name as the plan layout is: the app links them when it is built with Dragon's engine.
 */
internal class OutlineGeometry private constructor() {
	private fun type(name: String): Class<*> = Class.forName("dev.dragon.layout.$name")
	private val d = java.lang.Double.TYPE
	private val z = java.lang.Boolean.TYPE
	private val list = ArrayList::class.java
	private val string = String::class.java
	private val roundedShape = type("PaintRadiusKt").getMethod("paintRadius_roundedShape", d, d, d, d, d, d, list, list, d, type("RadiusFaults"))
	private val widthPx = type("PaintRadiusKt").getMethod("paintRadius_outlineWidthPx", d, d)
	private val offsetPx = type("PaintRadiusKt").getMethod("paintRadius_outlineOffsetPx", d, d)
	private val outlineRings = type("PaintRadiusKt").getMethod("paintRadius_outlineRings", d, d, d, d, list, d, d, z)
	private val needsSidePainter = type("PaintDashKt").getMethod("paintDash_outlineNeedsSidePainter", string)
	private val outlinePaintOps = type("PaintDashKt").getMethod("paintDash_outlinePaintOps", d, d, d, d, d, string, d, d, d, d, type("DashFaults"))
	private val radiusLength = type("RadiusLength").getConstructor(z, d)
	private val radiusFaults = type("RadiusFaults").getConstructor(z, z).newInstance(false, false)
	private val dashFaults = type("DashFaults").getConstructor(z, z).newInstance(false, false)
	private val op = type("BorderOp")
	private val opFields = listOf("getOp", "getSide", "getAlpha", "getAntialias", "getPoints").map { op.getMethod(it) }

	private fun call(f: Method, vararg args: Any): Any = try {
		f.invoke(null, *args)
	} catch (e: InvocationTargetException) {
		val cause = e.cause ?: e
		throw MarklessHostError("Dragon's outline painter refused it: ${cause.message ?: cause}")
	}

	/** The rings in page device px (24 numbers each) and, for a dotted, dashed or 3D outline, its side-painter operations. */
	@Suppress("UNCHECKED_CAST")
	fun of(o: OutlinePaint): Pair<List<Double>, List<BorderOp>> {
		val e = o.edges
		val shape = call(roundedShape, e[0], e[1], e[2], e[3], o.size[0], o.size[1], ArrayList(o.borders), ArrayList(o.radii.map { (percent, value) -> radiusLength.newInstance(percent, value) }), o.dpr, radiusFaults) as List<Double>
		val width = call(widthPx, o.width, o.dpr) as Double
		val offset = call(offsetPx, o.offset, o.dpr) as Double
		val rings = call(outlineRings, e[0], e[1], e[2], e[3], ArrayList(shape.subList(0, 8)), width, offset, o.style == "double") as List<Double>
		if (rings.size < 24 || rings.size % 24 != 0) throw MarklessHostError("an outline of ${rings.size} ring values")
		if (!(call(needsSidePainter, o.style) as Boolean)) return rings to emptyList()
		if (rings.size != 24) throw MarklessHostError("a ${o.style} outline has ${rings.size / 24} rings")
		val c = o.color
		val ops = call(outlinePaintOps, rings[0], rings[1], rings[2], rings[3], width, o.style, c.r.toDouble(), c.g.toDouble(), c.b.toDouble(), c.alpha.toDouble(), dashFaults) as List<Any>
		return rings to ops.map { x ->
			val (name, side, alpha, antialias, points) = opFields.map { it.invoke(x) }
			BorderOp(name as String, (side as Double).toInt(), alpha as Double, antialias as Boolean, points as List<Double>)
		}
	}

	companion object {
		val dragon: OutlineGeometry? by lazy {
			try {
				OutlineGeometry()
			} catch (_: ClassNotFoundException) {
				null
			}
		}
	}
}
