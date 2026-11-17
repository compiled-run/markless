#if canImport(UIKit)
import Foundation
@testable import MarklessCore
@testable import MarklessMobile
import Testing
import UIKit

private let mobilePackage: URL = {
	var url = URL(fileURLWithPath: #filePath)
	for _ in 0..<6 { url.deleteLastPathComponent() }
	return url
}()

private func counterPayload() throws -> Data { try vectorPayload("counter") }

private func vectorPayload(_ name: String) throws -> Data {
	guard case let .object(fields) = try JSONValue.parse(Data(contentsOf: mobilePackage.appendingPathComponent("conformance/\(name).json"))),
		let payload = fields.first(where: { $0.0 == "payload" })?.1
	else { throw HostError("no payload in the counter vector") }
	return Data(payload.jsonText.utf8)
}

private let styleFixture = mobilePackage.appendingPathComponent("src/adapters/ios/Tests/MarklessCoreTests/Fixtures/counter.native-style.json")

/// Inter from a Dragon checkout (`MARKLESS_DRAGON_DIR`, passed to the simulator as `TEST_RUNNER_MARKLESS_DRAGON_DIR`).
private func dragonFonts(for style: Data) throws -> [String: Data] {
	let dragon = try #require(ProcessInfo.processInfo.environment["MARKLESS_DRAGON_DIR"], "set TEST_RUNNER_MARKLESS_DRAGON_DIR")
	let export = try StyleExport.decode(style)
	return try Dictionary(uniqueKeysWithValues: export.fonts.map { ($0.id, try Data(contentsOf: URL(fileURLWithPath: dragon).appendingPathComponent($0.file))) })
}

@MainActor
private func tree(_ controller: MarklessViewController) throws -> ViewTree {
	controller.loadViewIfNeeded()
	return try #require(controller.tree)
}

@MainActor @Test func buildsTheCounterWithTraitsAndAppliesItsJournal() throws {
	let controller = try MarklessViewController(payload: counterPayload())
	let views = try tree(controller)
	let button = try #require(views.elements["h2"] as? UIButton)
	#expect(button.accessibilityTraits.contains(.button))
	#expect(button.accessibilityLabel == "Count 0")
	#expect(button.accessibilityIdentifier == "h2")
	let heading = try #require(views.labels["h1:text0"])
	#expect(heading.accessibilityTraits.contains(.header))
	#expect(heading.text == "Counter")
	let count = try #require(views.labels["h2:text0"])
	#expect(!count.isAccessibilityElement)
	#expect(!count.isUserInteractionEnabled)
	#expect(count.superview === button)
	#expect(count.textColor == .label)

	button.sendActions(for: .touchUpInside)
	#expect(count.text == "Count 1")
	#expect(button.accessibilityLabel == "Count 1")
	controller.perform(NativeAction(event: .activate, host: "h2"))
	#expect(count.text == "Count 2")
	#expect(heading.text == "Counter")
}

@MainActor @Test func attributesFollowStateAsPlatformState() throws {
	let controller = try MarklessViewController(payload: vectorPayload("attributes"))
	let views = try tree(controller)
	let heart = try #require(views.elements["h2"] as? UIButton)
	let clear = try #require(views.elements["h3"] as? UIButton)
	#expect(heart.accessibilityLabel == "Like")
	#expect(!heart.accessibilityTraits.contains(.selected))
	#expect(!clear.isEnabled)
	#expect(clear.accessibilityTraits.contains(.notEnabled))
	heart.sendActions(for: .touchUpInside)
	#expect(heart.accessibilityLabel == "Unlike")
	#expect(heart.accessibilityTraits.contains(.selected))
	#expect(clear.isEnabled)
	#expect(!clear.accessibilityTraits.contains(.notEnabled))
	clear.sendActions(for: .touchUpInside)
	#expect(heart.accessibilityLabel == "Like")
	#expect(!clear.isEnabled)
}

@MainActor @Test func armsAreBuiltAndRemovedInPlace() throws {
	let controller = try MarklessViewController(payload: vectorPayload("if"))
	let views = try tree(controller)
	let main = try #require(views.elements["h0"])
	let visible = { main.subviews.filter { !$0.isHidden }.map { $0.accessibilityIdentifier ?? "" } }
	#expect(visible() == ["h1", "h2", "h4"])
	#expect(views.labels["h3:text0"] == nil)
	controller.perform(NativeAction(event: .activate, host: "h2"))
	#expect(visible() == ["h1", "h2", "h3"])
	#expect(views.labels["h3:text0"]?.text == "The details are here")
	#expect(views.labels["h4:text0"] == nil)
	#expect(views.labels["h2:text0"]?.text == "Hide details")
	controller.perform(NativeAction(event: .activate, host: "h2"))
	#expect(visible() == ["h1", "h2", "h4"])
	#expect(throws: HostError.self) { try views.apply([.text(node: "h3:text0", value: "gone")]) }
}

@Test func userDefaultsKeepEachValueAsItsOwnType() throws {
	let defaults = try #require(UserDefaults(suiteName: "markless-ios-host-tests"))
	defaults.removePersistentDomain(forName: "markless-ios-host-tests")
	let store = UserDefaultsStore(defaults)
	for value: NativeValue in [
		.string("1"), .number(1), .bool(true), .number(-2.5), .string(""),
		.array([.null, .number(1), .object([(key: "b", value: .string("x")), (key: "a", value: .bool(false))])]),
	] {
		store.write("k", value)
		#expect(store.read("k") == value)
	}
	store.write("k", .null)
	#expect(store.read("k") == nil)
}

@MainActor @Test func aTextFieldSendsItsTextAndTakesWritesFromOtherHandlers() throws {
	let controller = try MarklessViewController(payload: vectorPayload("input"), store: MemoryStore())
	let views = try tree(controller)
	let field = try #require(views.elements["h2"] as? UITextField)
	#expect(field.text == "Sam")
	#expect(field.accessibilityLabel == "Name")
	controller.view.frame = CGRect(x: 0, y: 0, width: 402, height: 874)
	controller.view.layoutIfNeeded()
	#expect(field.frame.height > 20)
	field.text = "Samantha"
	field.sendActions(for: .editingChanged)
	#expect(views.labels["h3:text0"]?.text == "Hello Samantha")
	#expect(field.text == "Samantha")
	try #require(views.elements["h4"] as? UIButton).sendActions(for: .touchUpInside)
	#expect(field.text == "Bo")
	#expect(views.labels["h3:text0"]?.text == "Hello Bo")
}

@MainActor @Test func rowsAreBuiltRemovedAndMovedNotRebuilt() throws {
	let controller = try MarklessViewController(payload: vectorPayload("list"), store: MemoryStore())
	let views = try tree(controller)
	let list = try #require(views.elements["h5"])
	let rows = { list.subviews.filter { !$0.isHidden }.compactMap(\.accessibilityIdentifier) }
	#expect(rows() == ["h6@apple", "h6@pear"])
	let pear = try #require(views.labels["h6:text0@pear"])
	controller.perform(NativeAction(event: .activate, host: "h2"))
	#expect(rows() == ["h6@apple", "h6@pear", "h6@plum"])
	#expect(views.labels["h6:text0@plum"]?.text == "Plum")
	controller.perform(NativeAction(event: .activate, host: "h3"))
	#expect(rows() == ["h6@pear", "h6@plum"])
	#expect(views.labels["h6:text0@apple"] == nil)
	controller.perform(NativeAction(event: .activate, host: "h4"))
	#expect(rows() == ["h6@plum", "h6@pear"])
	#expect(views.labels["h6:text0@pear"] === pear)
}

@MainActor @Test func aPageOpensAtItsRouteAndNavigatesFromScratch() throws {
	let controller = try MarklessViewController(payload: vectorPayload("route"), store: MemoryStore(), route: "/apple")
	let before = try tree(controller)
	#expect(before.labels["h1:text0"]?.text == "Fruit apple")
	let link = try #require(before.elements["component-edge:1"] as? UIButton)
	#expect(link.accessibilityTraits.contains(.link))
	#expect(link.accessibilityLabel == "Go to pear")
	link.sendActions(for: .touchUpInside)
	let after = try #require(controller.tree)
	#expect(after !== before)
	#expect(after.labels["h1:text0"]?.text == "Fruit pear")
	#expect(after.root.superview === controller.view)
	#expect(before.root.superview == nil)
	#expect(throws: HostError.self) { try MarklessViewController(payload: vectorPayload("route"), store: MemoryStore(), route: "/apple/seeds") }
}

/// The attributes rung's payload with a `/1` export written from it: two assignments that differ in the heart's background.
private func toggleExport(initial: Int = 0) throws -> (NativeViewPayload, Data) {
	var url = URL(fileURLWithPath: #filePath)
	for _ in 0..<6 { url.deleteLastPathComponent() }
	guard case let .object(fields) = try JSONValue.parse(Data(contentsOf: url.appendingPathComponent("conformance/attributes.json"))),
		let json = fields.first(where: { $0.0 == "payload" })?.1
	else { throw PayloadError(path: "vector", reason: "no payload") }
	let payload = try NativeViewPayload.decode(json)
	let texts = Dictionary(uniqueKeysWithValues: try NativeRuntime(payload: payload).texts().map { ($0.node, $0.text) })
	func nodes(_ red: Int) -> String {
		payload.nodes.map { node in
			let text = node.isText ? "\"\(texts[node.id]!)\"" : "null"
			let writes = node.isText ? "" : #"{"kind":"background-color","color":{"r":\#(node.id == "h2" ? red : 0),"g":0,"b":0,"alpha":255},"key":"backgroundColor"}"#
			return #"{"id":"\#(node.id)","parent":\#(node.parent.map { "\"\($0)\"" } ?? "null"),"kind":"\#(node.isText ? "text" : "element")","native":"\#(node.isText ? "DragonTextView" : "DragonBoxView")","text":\#(text),"frame":{"x":0,"y":0,"width":30,"height":30},"borderWidths":\#(node.isText ? "null" : #"{"top":0,"right":0,"bottom":0,"left":0}"#),"writes":[\#(writes)]}"#
		}.joined(separator: ",")
	}
	let export = #"""
		{"schema":"dragon.native-style-export/1","units":"device px; frames relative to the parent box","fonts":[],"targets":{"ios":{"backend":"uikit","viewport":{"width":402,"height":778},"dpr":3,
		"states":[{"key":"doc/app#state:liked","domain":[false,true]}],"initial":\#(initial),
		"assignments":[{"values":{"doc/app#state:liked":false},"nodes":[\#(nodes(10))]},{"values":{"doc/app#state:liked":true},"nodes":[\#(nodes(200))]}],
		"next":[[[0,1]],[[0,1]]]}}}
		"""#
	return (payload, Data(export.utf8))
}

@MainActor @Test func aStyledCellMovesEveryViewToTheNextAssignment() throws {
	let (_, export) = try toggleExport()
	let controller = try MarklessViewController(payload: vectorPayload("attributes"), style: export, store: MemoryStore())
	let views = try tree(controller)
	let heart = try #require(views.elements["h2"] as? UIButton)
	var red: CGFloat = 0
	heart.backgroundColor?.getRed(&red, green: nil, blue: nil, alpha: nil)
	#expect(Int((red * 255).rounded()) == 10)
	heart.sendActions(for: .touchUpInside)
	heart.backgroundColor?.getRed(&red, green: nil, blue: nil, alpha: nil)
	#expect(Int((red * 255).rounded()) == 200)
	#expect(heart.accessibilityLabel == "Unlike")
}

@MainActor @Test func journalNamingAnUnknownNodeIsAnError() throws {
	let controller = try MarklessViewController(payload: counterPayload())
	let views = try tree(controller)
	#expect(throws: HostError.self) { try views.apply([.text(node: "h9:text0", value: "x")]) }
}

@MainActor @Test func paintsDragonsExport() throws {
	let style = try Data(contentsOf: styleFixture)
	let controller = try MarklessViewController(payload: counterPayload(), style: style, fonts: dragonFonts(for: style))
	let views = try tree(controller)
	let button = try #require(views.elements["h2"] as? UIButton)
	#expect(button.frame == CGRect(x: 424.453125 / 3, y: 101, width: 357.09375 / 3, height: 52))
	#expect(button.layer.borderWidth == 2)
	#expect(button.layer.cornerRadius == 12)
	#expect(button.backgroundColor == UIColor(red: 37 / 255, green: 99 / 255, blue: 235 / 255, alpha: 1))
	let count = try #require(views.labels["h2:text0"])
	#expect(count.font.pointSize == 20)
	#expect(count.font.fontName == "Inter-Regular")
	#expect(views.labels["h1:text0"]?.font.fontName == "Inter-Bold")
	var rgba: (CGFloat, CGFloat, CGFloat, CGFloat) = (0, 0, 0, 0)
	#expect(count.textColor.getRed(&rgba.0, green: &rgba.1, blue: &rgba.2, alpha: &rgba.3))
	#expect([rgba.0, rgba.1, rgba.2, rgba.3] == [1, 1, 1, 1])
	#expect(count.frame == CGRect(x: 22, y: 14, width: 225.09375 / 3, height: 24))
}

@MainActor @Test func refusesMissingOrWrongFonts() throws {
	let style = try Data(contentsOf: styleFixture)
	#expect(throws: HostError.self) { try MarklessViewController(payload: counterPayload(), style: style) }
	let fonts = try dragonFonts(for: style)
	let swapped = Dictionary(uniqueKeysWithValues: zip(fonts.keys, fonts.values.reversed()))
	#expect(throws: HostError.self) { try MarklessViewController(payload: counterPayload(), style: style, fonts: swapped) }
}
#endif
