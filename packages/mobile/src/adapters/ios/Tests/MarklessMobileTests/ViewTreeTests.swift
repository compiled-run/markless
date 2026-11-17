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

@MainActor @Test func journalNamingAnUnknownNodeIsAnError() throws {
	let views = try tree(try MarklessViewController(payload: counterPayload()))
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
