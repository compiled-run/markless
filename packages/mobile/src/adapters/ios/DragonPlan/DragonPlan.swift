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

	/// `runMarklessAnimation`: a page's animation events and frame from its export's animator tables, over every step so far.
	public static func animation(_ line: String) -> String {
		do {
			return try harness_runMarklessAnimation(JsString(line)).description
		} catch {
			return "[\"threw\"]"
		}
	}

	/// POSX-s scroll: `runMarklessSticky`, each sticky box's shift at the page's scroll offset.
	public static func sticky(_ line: String) -> String {
		do {
			return try harness_runMarklessSticky(JsString(line)).description
		} catch {
			return "[\"threw\"]"
		}
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
