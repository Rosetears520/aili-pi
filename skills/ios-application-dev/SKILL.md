---
name: ios-application-dev
description: |
  Build native iOS apps with SwiftUI, UIKit, SnapKit, Apple HIG, accessibility, and platform UI patterns.
---

# iOS Application Development Guide

A practical guide for building iOS applications using UIKit, SnapKit, and SwiftUI. Focuses on proven patterns and Apple platform conventions.

## Routing Boundary

Use this skill for native iOS/iPadOS apps, Swift, SwiftUI, UIKit, SnapKit, Apple platform APIs, App Store UI expectations, and iOS accessibility. Use `android-native-dev` for native Android, `flutter-dev` for Flutter/Dart, `react-native-dev` for React Native/Expo, and frontend web skills for browser React/Next/Vue UI.

## Quick Reference

### Implementation Workflow

1. **Inspect the app boundary**: identify SwiftUI vs UIKit ownership, deployment target, package manager, navigation root, design system, accessibility patterns, and nearest tests before editing.
2. **Choose SwiftUI or UIKit** with the decision table below; keep mixed apps at their existing seam instead of moving screens across frameworks.
3. **Implement one screen/flow at a time**: data model or view model first, navigation/presentation second, layout third, accessibility/privacy states fourth.
4. **Build and test**: run the narrowest available Xcode scheme/test target; for UI-only changes, also inspect Dynamic Type, Dark Mode, VoiceOver labels, and reduced motion behavior.
5. **Report platform evidence**: include scheme/device or simulator used, tests run, and any manual checks that could not be executed.

🔴 CHECKPOINT · 🛑 STOP before changing navigation roots, permission timing, authentication/sign-in behavior, App Store-facing privacy behavior, or converting a screen between SwiftUI and UIKit. These are product/API decisions, not local UI cleanup.

### SwiftUI vs UIKit Decision Table

| Situation | Use | Avoid |
|---|---|---|
| New simple screen in SwiftUI app | `View` + `@StateObject`/`@Observable` pattern already present | Introducing UIKit controller just for layout convenience |
| Existing UIKit feature | `UIViewController`, `UICollectionView`, SnapKit, existing coordinator | Rewriting to SwiftUI unless migration is requested |
| Complex collection/grid | Existing UIKit compositional layout or SwiftUI `Grid/List` if app already uses it | Mixing two list systems in one screen |
| Deep navigation/state restoration | Existing `UINavigationController`/coordinator or `NavigationStack` pattern | Ad-hoc modal chains without back path |
| Custom drawing/animation | Core Animation/UIKit when precision is needed; SwiftUI animation for simple state transitions | Decorative motion that ignores Reduce Motion |

### Failure Modes and Fallbacks

| Trigger | First response | If still failing |
|---|---|---|
| Xcode build fails from signing/provisioning | Separate code errors from signing errors; verify compile diagnostics first | Report signing as environment-blocked; do not change bundle IDs or teams |
| SwiftUI preview fails | Run the scheme/tests instead of treating preview failure as runtime truth | Mark preview-only issue separately if app builds |
| Auto Layout warnings appear | Identify the exact conflicting constraint and adjust local priorities/anchors | Do not silence by lowering many priorities; stop if layout ownership is unclear |
| Dynamic Type truncates content | Reflow layout, allow multiline text, or adjust stack priorities | Report if product copy/visual design must change |
| Permission prompt behavior is unclear | Inspect existing permission wrapper and Info.plist strings | Stop before changing request timing or privacy copy |
| UI test is flaky | Re-run once, check accessibility identifiers and async waits | Report flake evidence; do not add arbitrary sleeps |

### Do Not Do This

- Do not use hamburger/drawer navigation in native iOS flows.
- Do not override system back gestures or remove standard dismissal paths.
- Do not request camera/location/notification permissions at launch unless explicitly required.
- Do not use hard-coded colors/fonts that break Dark Mode or Dynamic Type.
- Do not change signing, entitlements, bundle identifiers, or privacy prompts as a side effect of UI work.

### UIKit

| Purpose | Component |
|---------|-----------|
| Main sections | `UITabBarController` |
| Drill-down | `UINavigationController` |
| Focused task | Sheet presentation |
| Critical choice | `UIAlertController` |
| Secondary actions | `UIContextMenuInteraction` |
| List content | `UICollectionView` + `DiffableDataSource` |
| Sectioned list | `DiffableDataSource` + `headerMode` |
| Grid layout | `UICollectionViewCompositionalLayout` |
| Search | `UISearchController` |
| Share | `UIActivityViewController` |
| Location (once) | `CLLocationButton` |
| Feedback | `UIImpactFeedbackGenerator` |
| Linear layout | `UIStackView` |
| Custom shapes | `CAShapeLayer` + `UIBezierPath` |
| Gradients | `CAGradientLayer` |
| Modern buttons | `UIButton.Configuration` |
| Dynamic text | `UIFontMetrics` + `preferredFont` |
| Dark mode | Semantic colors (`.systemBackground`, `.label`) |
| Permissions | Contextual request + `AVCaptureDevice` |
| Lifecycle | `UIApplication` notifications |

### SwiftUI

| Purpose | Component |
|---------|-----------|
| Main sections | `TabView` + `tabItem` |
| Drill-down | `NavigationStack` + `NavigationPath` |
| Focused task | `.sheet` + `presentationDetents` |
| Critical choice | `.alert` |
| Secondary actions | `.contextMenu` |
| List content | `List` + `.insetGrouped` |
| Search | `.searchable` |
| Share | `ShareLink` |
| Location (once) | `LocationButton` |
| Feedback | `UIImpactFeedbackGenerator` |
| Progress (known) | `ProgressView(value:total:)` |
| Progress (unknown) | `ProgressView()` |
| Dynamic text | `.font(.body)` semantic styles |
| Dark mode | `.primary`, `.secondary`, `Color(.systemBackground)` |
| Scene lifecycle | `@Environment(\.scenePhase)` |
| Reduce motion | `@Environment(\.accessibilityReduceMotion)` |
| Dynamic type | `@Environment(\.dynamicTypeSize)` |

## Core Principles

### Layout
- Touch targets >= 44pt
- Content within safe areas (SwiftUI respects by default, use `.ignoresSafeArea()` only for backgrounds)
- Use 8pt spacing increments (8, 16, 24, 32, 40, 48)
- Primary actions in thumb zone
- Support all screen sizes (iPhone SE 375pt to Pro Max 430pt)

### Typography
- UIKit: `preferredFont(forTextStyle:)` + `adjustsFontForContentSizeCategory = true`
- SwiftUI: semantic text styles `.headline`, `.body`, `.caption`
- Custom fonts: `UIFontMetrics` / `Font.custom(_:size:relativeTo:)`
- Adapt layout at accessibility sizes (minimum 11pt)

### Colors
- Use semantic system colors (`.systemBackground`, `.label`, `.primary`, `.secondary`)
- Asset catalog variants for custom colors (Any/Dark Appearance)
- No color-only information (pair with icons or text)
- Contrast ratio >= 4.5:1 for normal text, 3:1 for large text

### Accessibility
- Labels on icon buttons (`.accessibilityLabel()`)
- Reduce motion respected (`@Environment(\.accessibilityReduceMotion)`)
- Logical reading order (`.accessibilitySortPriority()`)
- Support Bold Text, Increase Contrast preferences

### Navigation
- Tab bar (3-5 sections) stays visible during navigation
- Back swipe works (never override system gestures)
- State preserved across tabs (`@SceneStorage`, `@State`)
- Never use hamburger menus

### Privacy & Permissions
- Request permissions in context (not at launch)
- Custom explanation before system dialog
- Support Sign in with Apple
- Respect ATT denial

## Checklist

### Layout
- [ ] Touch targets >= 44pt
- [ ] Content within safe areas
- [ ] Primary actions in thumb zone (bottom half)
- [ ] Flexible widths for all screen sizes (SE to Pro Max)
- [ ] Spacing aligns to 8pt grid

### Typography
- [ ] Semantic text styles or UIFontMetrics-scaled custom fonts
- [ ] Dynamic Type supported up to accessibility sizes
- [ ] Layouts reflow at large sizes (no truncation)
- [ ] Minimum text size 11pt

### Colors
- [ ] Semantic system colors or light/dark asset variants
- [ ] Dark Mode is intentional (not just inverted)
- [ ] No color-only information
- [ ] Text contrast >= 4.5:1 (normal) / 3:1 (large)
- [ ] Single accent color for interactive elements

### Accessibility
- [ ] VoiceOver labels on all interactive elements
- [ ] Logical reading order
- [ ] Bold Text preference respected
- [ ] Reduce Motion disables decorative animations
- [ ] All gestures have alternative access paths

### Navigation
- [ ] Tab bar for 3-5 top-level sections
- [ ] No hamburger/drawer menus
- [ ] Tab bar stays visible during navigation
- [ ] Back swipe works throughout
- [ ] State preserved across tabs

### Components
- [ ] Alerts for critical decisions only
- [ ] Sheets have dismiss path (button and/or swipe)
- [ ] List rows >= 44pt tall
- [ ] Destructive buttons use `.destructive` role

### Privacy
- [ ] Permissions requested in context (not at launch)
- [ ] Custom explanation before system permission dialog
- [ ] Sign in with Apple offered with other providers
- [ ] Basic features usable without account
- [ ] ATT prompt shown if tracking, denial respected

### System Integration
- [ ] App handles interruptions gracefully (calls, background, Siri)
- [ ] App content indexed for Spotlight
- [ ] Share Sheet available for shareable content

## References

| Topic | Reference |
|-------|-----------|
| Touch Targets, Safe Area, CollectionView | [Layout System](references/layout-system.md) |
| TabBar, NavigationController, Modal | [Navigation Patterns](references/navigation-patterns.md) |
| StackView, Button, Alert, Search, ContextMenu | [UIKit Components](references/uikit-components.md) |
| CAShapeLayer, CAGradientLayer, Core Animation | [Graphics & Animation](references/graphics-animation.md) |
| Dynamic Type, Semantic Colors, VoiceOver | [Accessibility](references/accessibility.md) |
| Permissions, Location, Share, Lifecycle, Haptics | [System Integration](references/system-integration.md) |
| Metal Shaders & GPU | [Metal Shader Reference](references/metal-shader.md) |
| SwiftUI HIG, Components, Patterns, Anti-Patterns | [SwiftUI Design Guidelines](references/swiftui-design-guidelines.md) |
| Optionals, Protocols, async/await, ARC, Error Handling | [Swift Coding Standards](references/swift-coding-standards.md) |

---

Swift, SwiftUI, UIKit, SF Symbols, Metal, and Apple are trademarks of Apple Inc. SnapKit is a trademark of its respective owners.
