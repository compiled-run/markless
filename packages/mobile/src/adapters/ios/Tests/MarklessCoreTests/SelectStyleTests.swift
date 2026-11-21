import Foundation
@testable import MarklessCore
import Testing

// The S24 rung's app style and payload as the harness builds them, and Dragon's plan layout of it on a 402 x 778 point screen at 3x.
private func fixture(_ name: String) throws -> Data {
	try Data(contentsOf: try #require(Bundle.module.url(forResource: "Fixtures/\(name)", withExtension: "json")))
}

private func tagging() throws -> (StyleExport, NativeViewPayload, String) {
	let styles = try StyleExport.decodeApp(try fixture("s24-styled-select.native-app-style"))
	guard case let .app(app) = try NativePayload.decode(try fixture("s24-styled-select.payload")) else { throw PayloadError(path: "fixture", reason: "not an app") }
	let layout = String(decoding: try fixture("s24-styled-select.layout"), as: UTF8.self)
	return (try #require(styles["/"]), try #require(app.routes.first { $0.pattern == "/" }).page, layout)
}

private func writesArrow(_ node: StyleNode?) -> RGBA? {
	for case let .selectArrow(color) in node?.writes ?? [] { return color }
	return nil
}

@Test func aStyledSelectWritesItsArrowColourAndOneWithAppearanceNoneDoesNot() throws {
	let (style, _, _) = try tagging()
	let nodes = style.assignments[0].nodes
	#expect(writesArrow(nodes.first { $0.id == "h3" }) == RGBA(r: 29, g: 42, b: 36, alpha: 255))
	#expect(writesArrow(nodes.first { $0.id == "h5" }) == nil)
}

@Test func theExportPlansNoRowsForASelectsOptions() throws {
	let (style, _, _) = try tagging()
	#expect(style.planRepeats.isEmpty)
}

@Test func theSelectTakesTheArrowOfThePlanLayoutsFourthElement() throws {
	let (style, _, layout) = try tagging()
	let laid = try style.laidOut(width: 402, height: 778, scale: 3, layout: { _ in layout })
	let nodes = laid.assignments[0].nodes
	let arrow = try #require(nodes.first { $0.id == "h3" }?.selectArrow)
	#expect(arrow.strokeWidth == 2)
	#expect(arrow.points == [1024, 66, 1036, 78, 1048, 66])
	var y = 0.0
	for id in ["html", "body", "h0", "h3"] { y += try #require(nodes.first { $0.id == id }?.frame).y }
	#expect(arrow.originX == 0)
	#expect(arrow.originY == (y + 0.5).rounded(.down) - y)
	#expect(nodes.filter { $0.selectArrow != nil }.map(\.id) == ["h3"])
}

@Test func aStyledSelectResolvesItsArrowAndItsLabelBoxAndItsOptionsNone() throws {
	let (style, page, layout) = try tagging()
	let runtime = NativeRuntime(payload: page)
	let laid = try style.laidOut(width: 402, height: 778, scale: 3, layout: { _ in layout })
	let styles = try laid.resolve(for: page, initialTexts: try runtime.texts(), value: runtime.value(of:), arm: runtime.styleArm(of:)).styles
	let select = try #require(styles["h3"])
	#expect(select.selectArrow?.color == RGBA(r: 29, g: 42, b: 36, alpha: 255))
	#expect(select.selectArrow?.scale == 3)
	let inner = try #require(laid.assignments[0].nodes.first { $0.parent == "h3" }?.frame)
	let label = try #require(select.selectLabel)
	#expect(label.frame == Frame(x: inner.x / 3, y: inner.y / 3, width: inner.width / 3, height: inner.height / 3))
	#expect(label.fontSize == 16)
	#expect(label.color == RGBA(r: 29, g: 42, b: 36, alpha: 255))
	#expect(styles["h5"]?.selectArrow == nil)
	#expect(styles["h5"]?.selectLabel != nil)
	for option in ["h4", "h4:text0", "h6", "h6:text0", "h7"] { #expect(styles[option] == nil) }
	// Before the page is laid out at the screen's size, the export as built resolves with no arrow.
	let built = try style.resolve(for: page, initialTexts: try runtime.texts(), value: runtime.value(of:), arm: runtime.styleArm(of:)).styles
	#expect(built["h3"]?.selectArrow == nil)
}

@Test func aSelectArrowWriteWithNoArrowGeometryNamesTheNode() throws {
	let (style, _, layout) = try tagging()
	guard case let .array(parts) = try JSONValue.parse(Data(layout.utf8)) else { throw PayloadError(path: "fixture", reason: "not an array") }
	let three = JSONValue.array(Array(parts.prefix(3))).jsonText
	#expect(throws: PayloadError.self) { try style.laidOut(width: 402, height: 778, scale: 3, layout: { _ in three }) }
	do {
		_ = try style.laidOut(width: 402, height: 778, scale: 3, layout: { _ in three })
	} catch let error as PayloadError {
		#expect(error.reason == "h3 draws a drop-down arrow, but Dragon's layout gives it no arrow geometry")
	}
	let other = JSONValue.array(Array(parts.prefix(3)) + [.array([.string("other"), .array([])])]).jsonText
	#expect(throws: PayloadError.self) { try style.laidOut(width: 402, height: 778, scale: 3, layout: { _ in other }) }
}

@Test func aSelectArrowWriteInAnExportWithNoPlanNamesTheNode() throws {
	var root = try #require(try JSONSerialization.jsonObject(with: try fixture("s24-styled-select.native-app-style")) as? [String: Any])
	var targets = try #require(root["targets"] as? [String: Any])
	var ios = try #require(targets["ios"] as? [String: Any])
	var routes = try #require(ios["routes"] as? [[String: Any]])
	for key in ["plan", "planNames", "planRepeats"] { routes[0].removeValue(forKey: key) }
	ios["routes"] = routes
	targets["ios"] = ios
	root["targets"] = targets
	let data = try JSONSerialization.data(withJSONObject: root)
	do {
		_ = try StyleExport.decodeApp(data)
		Issue.record("an export with an arrow and no plan decoded")
	} catch let error as PayloadError {
		#expect(error.reason == "h3 draws a drop-down arrow, whose geometry only Dragon's plan layout gives, and the export has no plan")
	}
}
