import Foundation
@testable import MarklessCore
import Testing

// The S27 rung's app style and payload as the harness builds them, and Dragon's plan layout of it on a 402 x 778 point screen at 3x.
private func fixture(_ name: String) throws -> Data {
	try Data(contentsOf: try #require(Bundle.module.url(forResource: "Fixtures/\(name)", withExtension: "json")))
}

private func pinning() throws -> (StyleExport, NativeViewPayload, String) {
	let styles = try StyleExport.decodeApp(try fixture("s27-styled-checkbox.native-app-style"))
	guard case let .app(app) = try NativePayload.decode(try fixture("s27-styled-checkbox.payload")) else { throw PayloadError(path: "fixture", reason: "not an app") }
	let layout = String(decoding: try fixture("s27-styled-checkbox.layout"), as: UTF8.self)
	return (try #require(styles["/"]), try #require(app.routes.first { $0.pattern == "/" }).page, layout)
}

private func bits(_ hex: String) -> Double { Double(bitPattern: UInt64(hex, radix: 16)!) }

private func reason(_ style: StyleExport, _ layout: String) -> String? {
	do {
		_ = try style.laidOut(width: 402, height: 778, scale: 3, layout: { _ in layout })
		return nil
	} catch let error as PayloadError {
		return error.reason
	} catch {
		return "\(error)"
	}
}

private func parts(_ layout: String) throws -> [JSONValue] {
	guard case let .array(parts) = try JSONValue.parse(Data(layout.utf8)) else { throw PayloadError(path: "fixture", reason: "not an array") }
	return parts
}

@Test func aThemedCheckboxWritesChromesColoursForItsAccent() throws {
	let (style, _, _) = try pinning()
	var colors: CheckboxColors?
	for case let .checkbox(c) in style.assignments[0].nodes.first(where: { $0.id == "h3" })?.writes ?? [] { colors = c }
	let white = RGBA(r: 255, g: 255, b: 255, alpha: 255)
	#expect(colors == CheckboxColors(uncheckedBackground: white, uncheckedBorder: RGBA(r: 118, g: 118, b: 118, alpha: 255), checkedBackground: white, fill: RGBA(r: 194, g: 65, b: 12, alpha: 255), check: white))
}

@Test func theCheckboxTakesItsMarksFromThePlanLayoutsTaggedSuffix() throws {
	let (style, _, layout) = try pinning()
	let laid = try style.laidOut(width: 402, height: 778, scale: 3, layout: { _ in layout })
	for assignment in laid.assignments {
		let nodes = assignment.nodes
		let marks = try #require(nodes.first { $0.id == "h3" }?.checkboxMarks)
		#expect(marks.side == 66)
		#expect(!marks.plain)
		#expect(marks.radius == 6)
		#expect(marks.backgroundInset == bits("3fe3333333333334"))
		#expect(marks.borderInset == 1.5)
		#expect(marks.borderWidth == 3)
		#expect(marks.check == ["402a666666666667", "4040800000000000", "403a666666666667", "4047199999999999", "404a666666666667", "402a666666666667"].map(bits))
		#expect(marks.checkWidth == bits("40251eb851eb851f"))
		var x = 0.0, y = 0.0
		var at: String? = "h3"
		while let id = at, let node = nodes.first(where: { $0.id == id }) {
			let frame = try #require(node.frame)
			x += frame.x
			y += frame.y
			at = node.parent
		}
		#expect(marks.originX == (x + 0.5).rounded(.down) - x)
		#expect(marks.originY == (y + 0.5).rounded(.down) - y)
		#expect(nodes.filter { $0.checkboxMarks != nil }.map(\.id) == ["h3"])
	}
}

@Test func aLaidOutCheckboxResolvesItsMarksAndColoursAtTheScreensScale() throws {
	let (style, page, layout) = try pinning()
	let runtime = NativeRuntime(payload: page)
	let laid = try style.laidOut(width: 402, height: 778, scale: 3, layout: { _ in layout })
	let styles = try laid.resolve(for: page, initialTexts: try runtime.texts(), value: runtime.value(of:), arm: runtime.styleArm(of:)).styles
	let box = try #require(styles["h3"]?.checkbox)
	#expect(box.scale == 3)
	#expect(box.colors.fill == RGBA(r: 194, g: 65, b: 12, alpha: 255))
	#expect(box.marks.side == 66)
	// Before the page is laid out at the screen's size, the export as built resolves with no marks.
	let built = try style.resolve(for: page, initialTexts: try runtime.texts(), value: runtime.value(of:), arm: runtime.styleArm(of:)).styles
	#expect(built["h3"]?.checkbox == nil)
}

@Test func aCheckboxWriteWithNoMarksAndMarksWithNoCheckboxNameTheNode() throws {
	let (style, _, layout) = try pinning()
	let all = try parts(layout)
	#expect(reason(style, JSONValue.array(Array(all.prefix(3))).jsonText) == "h3 draws a themed checkbox, but Dragon's layout gives it no marks")
	guard case let .array(suffix) = all[3], case let .array(entries) = suffix[1], case let .array(entry) = entries[0] else { throw PayloadError(path: "fixture", reason: "no marks") }
	let stray = JSONValue.array([.string("h9")] + entry.dropFirst())
	let extra = JSONValue.array(Array(all.prefix(3)) + [.array([suffix[0], .array(entries + [stray])])]).jsonText
	#expect(reason(style, extra) == "Dragon's layout gives checkbox marks for h9, which it shows no box for")
}

@Test func thePlanLayoutsTaggedSuffixesAreReadByTagInEitherOrderEachOnce() throws {
	let (style, _, layout) = try pinning()
	let all = try parts(layout)
	let arrows = JSONValue.array([.string("menulist-arrows"), .array([])])
	let before = JSONValue.array(Array(all.prefix(3)) + [arrows, all[3]]).jsonText
	let after = JSONValue.array(Array(all.prefix(4)) + [arrows]).jsonText
	for text in [before, after] {
		let laid = try style.laidOut(width: 402, height: 778, scale: 3, layout: { _ in text })
		#expect(laid.assignments[0].nodes.first { $0.id == "h3" }?.checkboxMarks?.side == 66)
	}
	#expect(reason(style, JSONValue.array(Array(all.prefix(4)) + [all[3]]).jsonText) != nil)
	#expect(reason(style, JSONValue.array(Array(all.prefix(3)) + [.array([.string("other"), .array([])])]).jsonText) != nil)
}

@Test func aCheckboxWriteInAnExportWithNoPlanNamesTheNode() throws {
	var root = try #require(try JSONSerialization.jsonObject(with: try fixture("s27-styled-checkbox.native-app-style")) as? [String: Any])
	var targets = try #require(root["targets"] as? [String: Any])
	var ios = try #require(targets["ios"] as? [String: Any])
	var routes = try #require(ios["routes"] as? [[String: Any]])
	for key in ["plan", "planNames", "planRepeats"] { routes[0].removeValue(forKey: key) }
	ios["routes"] = routes
	targets["ios"] = ios
	root["targets"] = targets
	do {
		_ = try StyleExport.decodeApp(try JSONSerialization.data(withJSONObject: root))
		Issue.record("an export with a themed checkbox and no plan decoded")
	} catch let error as PayloadError {
		#expect(error.reason == "h3 draws a themed checkbox, whose marks only Dragon's plan layout gives, and the export has no plan")
	}
}
