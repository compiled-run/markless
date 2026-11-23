package dev.markless.mobile.view

import dev.markless.mobile.core.Json
import dev.markless.mobile.core.text
import dev.markless.mobile.style.SystemFace
import java.io.File
import java.lang.reflect.InvocationTargetException
import java.lang.reflect.Method
import java.nio.ByteBuffer

/**
 * Shapes a row's text as Dragon's build shapes an Android system face (parity/src/system-fonts/provider.ts androidSystemFonts):
 * HarfBuzz through Dragon's shim (`libdragon_hb.so`, found by name as the translated harness is) over `/system/fonts/<file>` at
 * the instance the build measured. An author face's file ([authored], its bytes by id) goes through the same HarfBuzz at its
 * default instance, as Dragon's build shapes it. A face that is neither is refused by name.
 */
class RowShaper(private val faces: Map<String, SystemFace>, private val authored: (String) -> ByteArray? = { null }) {
	private val hb: Class<*> = Class.forName("dev.dragon.text.DragonHB")
	private fun method(name: String): Method = hb.methods.first { it.name == name }
	private val faceCreate = method("faceCreate")
	private val fontCreate = method("fontCreate")
	private val shaperCreate = method("shaperCreate")
	private val shapeCall = method("shape")
	private val shaper: Long
	private val hbFaces = HashMap<String, Long>()
	private val fonts = HashMap<String, Long>()
	/** Why the last call was refused, kept because the translated harness reports any error only as ["threw"]. */
	var refused: String? = null
		private set
	/** Whether a call asked for a face the export gives no system font for, as a web font's. */
	var unshapedFace = false

	init {
		System.loadLibrary("dragon_hb")
		shaper = call(shaperCreate) as Long
	}

	private fun call(m: Method, vararg args: Any?): Any? = try {
		m.invoke(null, *args)
	} catch (e: InvocationTargetException) {
		throw e.cause ?: e
	}

	private fun refuse(why: String): Nothing {
		refused = why
		throw IllegalStateException(why)
	}

	private fun fontAt(id: String, size: Double): Long = fonts.getOrPut("$id@$size") {
		val face = faces[id] ?: return@getOrPut authorFontAt(id, size)
		val bytes = File("/system/fonts", face.file).readBytes()
		val handle = hbFaces.getOrPut("${face.file}#${face.index}") {
			(call(faceCreate, bytes, face.index) as Long).also { if (it == 0L) refuse("HarfBuzz cannot read /system/fonts/${face.file}") }
		}
		val instance = androidInstance(face.axes, fvarAxes(bytes, face.index))
		val rest = instance.filterKeys { it != "wght" && it != "wdth" && it != "slnt" }
		val tags = rest.keys.map { tag(it) }.toIntArray()
		val values = rest.values.map { it.toFloat() }.toFloatArray()
		(call(
			fontCreate, handle, size.toFloat(), size.toFloat(), (instance["wght"] ?: 400.0).toFloat(), (instance["wdth"] ?: 100.0).toFloat(),
			(-(instance["slnt"] ?: 0.0)).toFloat(), false, if (tags.isEmpty()) null else tags, if (values.isEmpty()) null else values,
		) as Long).also { if (it == 0L) refuse("HarfBuzz cannot make $id at $size px") }
	}

	private fun authorFontAt(id: String, size: Double): Long {
		val bytes = authored(id) ?: run { unshapedFace = true; refuse("a row's text in $id, which this host does not shape on the phone yet") }
		if (fvarAxes(bytes, 0).isNotEmpty()) refuse("a row's text in the variable author face $id, whose instance this host does not pick yet")
		val handle = hbFaces.getOrPut(id) {
			(call(faceCreate, bytes, 0) as Long).also { if (it == 0L) refuse("HarfBuzz cannot read the author face $id") }
		}
		return (call(fontCreate, handle, size.toFloat(), size.toFloat(), 400f, 100f, 0f, false, null, null) as Long)
			.also { if (it == 0L) refuse("HarfBuzz cannot make $id at $size px") }
	}

	/** Dragon's GlyphShaper call: glyph records (7 numbers per glyph) for text[start, end) in `face` at `size` device px. */
	fun shape(face: String, size: Double, text: String, start: Int, end: Int, script: String, rtl: Boolean, language: String, features: List<Double>): List<Double> {
		val glyphs = call(shapeCall, shaper, fontAt(face, size), text, start, end - start, tag(script), rtl, language, if (features.isEmpty()) null else features.map { it.toInt() }.toIntArray()) as IntArray?
			?: refuse("HarfBuzz ran out of memory shaping a row's text")
		return glyphs.map { it.toDouble() }
	}

	companion object {
		fun tag(s: String): Int = (s[0].code shl 24) or (s[1].code shl 16) or (s[2].code shl 8) or s[3].code

		private fun tagOf(n: Int): String = String(charArrayOf(((n ushr 24) and 255).toChar(), ((n ushr 16) and 255).toChar(), ((n ushr 8) and 255).toChar(), (n and 255).toChar()))

		/** A variable font's axes (its fvar table): tag, min, default, max; none for a static font. */
		fun fvarAxes(bytes: ByteArray, index: Int): List<DoubleArray> {
			val d = ByteBuffer.wrap(bytes)
			val collection = d.getInt(0) == 0x74746366
			val at = if (collection) d.getInt(12 + 4 * index) else 0
			val n = d.getShort(at + 4).toInt() and 0xffff
			for (i in 0 until n) {
				val o = at + 12 + i * 16
				if (tagOf(d.getInt(o)) != "fvar") continue
				val fvar = d.getInt(o + 8)
				val axesAt = fvar + (d.getShort(fvar + 4).toInt() and 0xffff)
				val count = d.getShort(fvar + 8).toInt() and 0xffff
				val size = d.getShort(fvar + 10).toInt() and 0xffff
				return (0 until count).map { k ->
					val a = axesAt + k * size
					doubleArrayOf(d.getInt(a).toDouble(), d.getInt(a + 4) / 65536.0, d.getInt(a + 8) / 65536.0, d.getInt(a + 12) / 65536.0)
				}
			}
			return emptyList()
		}

		/** Every axis as the build shapes it: fonts.xml's value, else wght 400, wdth 100, slnt 0 or the axis default, clamped. */
		fun androidInstance(axes: Map<String, Double>, fvar: List<DoubleArray>): Map<String, Double> {
			val request = mapOf("wght" to 400.0, "wdth" to 100.0, "slnt" to 0.0)
			return fvar.associate { a ->
				val tag = tagOf(a[0].toInt())
				tag to maxOf(a[1], minOf(a[3], axes[tag] ?: request[tag] ?: a[2]))
			}
		}

		/** Dragon's translated `runMarklessRowsLayout` with a shaper, when the app is built with Dragon's engine and shim. */
		fun rowsLayout(shaper: RowShaper): ((String) -> String)? = try {
			val glyphShaper = Class.forName("dev.dragon.layout.GlyphShaper")
			val run = Class.forName("dev.dragon.layout.HarnessKt").getMethod("harness_runMarklessRowsLayout", String::class.java, glyphShaper)
			val shape: (String, Double, String, Double, Double, String, Boolean, String, ArrayList<Double>) -> ArrayList<Double> =
				{ face, size, text, start, end, script, rtl, language, features -> ArrayList(shaper.shape(face, size, text, start.toInt(), end.toInt(), script, rtl, language, features)) }
			val instance = glyphShaper.constructors.first().newInstance(shape)
			({ line: String ->
				shaper.refused = null
				val out = try {
					run.invoke(null, line, instance) as String
				} catch (e: InvocationTargetException) {
					throw e.cause ?: e
				}
				val why = shaper.refused
				if (why == null) out else "[\"harness-error\",${Json.Str(why).text()}]"
			})
		} catch (_: ClassNotFoundException) {
			null
		}
	}
}
