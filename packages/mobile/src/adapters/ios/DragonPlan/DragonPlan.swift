// Compiled with Dragon's translated harness (Harness.swift, Host.swift) into one module, so its internal entry point is reachable.
#if canImport(DragonLayout)
import DragonLayout
#endif

/// Dragon's on-device layout of a Markless page: `runMarklessLayout`, translated from Dragon's TypeScript.
public enum DragonPlan {
	public static func layout(_ line: String) -> String {
		do {
			return try harness_runMarklessLayout(JsString(line)).description
		} catch {
			return "[\"threw\"]"
		}
	}

	/// `runMarklessRowsLayout`: the page with each list's rows in it. Text the build did not record is shaped by `shape`: face, size
	/// in device px, text, start and end (UTF-16 offsets), language and Dragon's feature integers, giving Dragon's glyph records.
	public static func rowsLayout(
		_ line: String, shape: @escaping (String, Double, String, Int, Int, String, [Double]) throws -> [Double]
	) -> String {
		// The translated harness turns any error into ["threw"]; the shaper's own reason is kept to report it by name.
		var refused: String?
		let shaper = GlyphShaper { face, size, text, start, end, _, rtl, language, features in
			do {
				if rtl { throw RowShapingError(description: "right-to-left text in a row is not shaped on iOS yet") }
				return JsArray(try shape(face.description, size, text.description, Int(start), Int(end), language.description, features.items))
			} catch {
				refused = "\(error)"
				throw error
			}
		}
		let out: String
		do {
			out = try harness_runMarklessRowsLayout(JsString(line), shaper).description
		} catch {
			out = "[\"threw\"]"
		}
		if let refused {
			let escaped = refused.map { $0 == "\\" ? "\\\\" : $0 == "\"" ? "\\\"" : String($0) }.joined()
			return "[\"harness-error\",\"\(escaped)\"]"
		}
		return out
	}

	/// `runtimeImagePaint` for an img whose src is set at run time, without its leaf, which it reads only for object-fit and
	/// object-position: `position` x then y (a percent, or CSS px zoomed as the zoomed leaf's), `content` the content box in
	/// absolute layout units. Gives the destination, the snapped content box and the drawn part (NaN when none), device px.
	public static func runtimeImagePaint(
		fit: String, position: [(percent: Bool, value: Double)], content: [Double], width: Double, height: Double, zoom: Double
	) throws -> [Double] {
		let axis = { (p: (percent: Bool, value: Double)) throws -> any U_LengthCalc_Percent_Px in
			p.percent ? Percent(JsString("percent"), p.value) : try environment_lengthPx(Px(JsString("px"), p.value), zoom)
		}
		let w = try units_fromCssPx(units_zoomCssPx(width, zoom))
		let h = try units_fromCssPx(units_zoomCssPx(height, zoom))
		let natural = NaturalSizing(w, h, w > 0 && h > 0 ? LayoutRatio(w, h) : nil)
		let box = ObjectRect(content[0], content[1], content[2], content[3])
		let dest = try replaced_objectFitRect(box, natural, JsString(fit), ObjectPosition(try axis(position[0]), try axis(position[1])), block_NO_ENGINE_FAULTS)
		let rect = { (r: PixelRect) in [r.x, r.y, r.width, r.height] }
		return rect(try replaced_pixelSnappedRect(dest)) + rect(try replaced_pixelSnappedRect(box))
			+ (try replaced_drawnObjectRect(dest, box).map(rect) ?? [.nan, .nan, .nan, .nan])
	}

	/// Dragon's translated library cases; `rt-band` looks a page's `@media` band up by its size.
	public static func library(_ line: String) -> String {
		do {
			return try harness_runLibraryCase(JsString(line)).description
		} catch {
			return "[\"threw\"]"
		}
	}
}

/// A row's text this host cannot shape as the build does.
struct RowShapingError: Error, CustomStringConvertible {
	let description: String
}
