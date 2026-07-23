---
name: flutter-dev
description: |
  Build Flutter/Dart cross-platform apps with widgets, state management, navigation, tests, and performance patterns.
---

# Flutter Development Guide

A practical guide for building cross-platform applications with Flutter 3 and Dart. Focuses on proven patterns, state management, and performance optimization.

## Routing Boundary

Use this skill for Flutter/Dart apps, widgets, Riverpod/Bloc, GoRouter, Flutter performance, and Flutter tests. Use `android-native-dev` for native Android/Kotlin, `ios-application-dev` for native iOS/Swift, `react-native-dev` for React Native/Expo, and web frontend skills for browser React/Next/Vue work.

## Quick Reference

### Implementation Workflow

1. **Inspect project shape**: identify Flutter version, `pubspec.yaml` dependencies, state package, router, existing feature folders, and nearest tests before editing.
2. **Choose the pattern** using the decision tables below; do not introduce Riverpod, Bloc, GoRouter, or Hooks into a project that already uses another working pattern unless the task explicitly asks for that migration.
3. **Implement the complete vertical slice**: model/state first, route or widget entry point second, UI states third (`loading`, `empty`, `error`, `success`), then platform-specific hooks only if required.
4. **Verify locally**: run the narrowest available command first, usually `flutter test <target>` for logic/widgets, then `flutter analyze`, then `flutter run --profile` only for performance work.
5. **Report evidence**: name changed widgets/providers/routes, state the verification command, and mark any skipped platform check as `Unverified`.

🔴 CHECKPOINT · 🛑 STOP before a state-management or router change if it would migrate existing app architecture, affect deep links/auth redirects, or require adding packages. Ask for approval instead of silently replacing the project pattern.

### State and Routing Decisions

| Need | Use | Do not use |
|---|---|---|
| Local ephemeral UI state | `StatefulWidget`, `useState`, or local `StateProvider` matching the project | Global provider for one text field or toggle |
| Shared synchronous app state | Riverpod `NotifierProvider` or existing Bloc/Cubit | Direct mutable singleton state |
| Async/server state | `AsyncNotifierProvider`, `FutureProvider`, or existing repository + Bloc | Manual `isLoading` booleans spread across widgets |
| Event-heavy workflow | Bloc/Cubit when already present or explicitly requested | Bloc for simple derived display state |
| Auth-aware navigation | Existing `GoRouter` redirect/auth guard pattern | Imperative pushes from random widgets |
| Feature navigation only | Existing route declarations plus typed route names | Ad-hoc string paths duplicated in widgets |

### Failure Modes and Fallbacks

| Trigger | First response | If still failing |
|---|---|---|
| `flutter pub get` fails | Inspect SDK/package constraints in `pubspec.yaml`; keep existing versions unless task allows dependency changes | Report dependency conflict; do not upgrade packages unasked |
| Widget test cannot pump route/provider | Wrap the widget with the same app-level providers/router used by nearby tests | Add a minimal test harness in the test file only if adjacent tests already do this |
| Auth redirect loops | Trace redirect conditions and provider loading state; ensure loading returns `null` redirect | Stop and report route/auth ambiguity before changing public navigation |
| Rebuild jank persists | Use DevTools/rebuild logging to identify the specific provider/widget; apply `select()` or `const` locally | Mark performance result `Unverified` if profile evidence is unavailable |
| Platform-specific behavior differs | Check `Platform`/plugin usage and run the relevant simulator/emulator if available | Report the unverified platform instead of assuming parity |

### Do Not Do This

- Do not add a new state-management framework just to satisfy a small widget task.
- Do not replace existing Navigator/GoRouter architecture without explicit migration scope.
- Do not optimize performance from intuition only; require profiling, rebuild counts, or a concrete failing scenario.
- Do not hide loading/error states to make UI code shorter.
- Do not add packages, generated code, or platform folders unless the task explicitly requires them.

### Widget Patterns

| Purpose | Component |
|---------|-----------|
| State management (simple) | `StateProvider` + `ConsumerWidget` |
| State management (complex) | `NotifierProvider` / `Bloc` |
| Async data | `FutureProvider` / `AsyncNotifierProvider` |
| Real-time streams | `StreamProvider` |
| Navigation | `GoRouter` + `context.go/push` |
| Responsive layout | `LayoutBuilder` + breakpoints |
| List display | `ListView.builder` |
| Complex scrolling | `CustomScrollView` + Slivers |
| Hooks | `HookWidget` + `useState/useEffect` |
| Forms | `Form` + `TextFormField` + validation |

### Performance Patterns

| Purpose | Solution |
|---------|----------|
| Prevent rebuilds | `const` constructors |
| Selective updates | `ref.watch(provider.select(...))` |
| Isolate repaints | `RepaintBoundary` |
| Lazy lists | `ListView.builder` |
| Heavy computation | `compute()` isolate |
| Image caching | `cached_network_image` |

## Core Principles

### Widget Optimization
- Use `const` constructors wherever possible
- Extract static widgets to separate const classes
- Use `Key` for list items (ValueKey, ObjectKey)
- Prefer `ConsumerWidget` over `StatefulWidget` for state

### State Management
- Riverpod for dependency injection and simple state
- Bloc/Cubit for event-driven workflows and complex logic
- Never mutate state directly (create new instances)
- Use `select()` to minimize rebuilds

### Layout
- 8pt spacing increments (8, 16, 24, 32, 48)
- Responsive breakpoints: mobile (<650), tablet (650-1100), desktop (>1100)
- Support all screen sizes with flexible layouts
- Follow Material 3 / Cupertino design guidelines

### Performance
- Profile with DevTools before optimizing
- Target <16ms frame time for 60fps
- Use `RepaintBoundary` for complex animations
- Offload heavy work with `compute()`

## Checklist

### Widget Best Practices
- [ ] `const` constructors on all static widgets
- [ ] Proper `Key` on list items
- [ ] `ConsumerWidget` for state-dependent widgets
- [ ] No widget building inside `build()` method
- [ ] Extract reusable widgets to separate files

### State Management
- [ ] Immutable state objects
- [ ] `select()` for granular rebuilds
- [ ] Proper provider scoping
- [ ] Dispose controllers and subscriptions
- [ ] Handle loading/error states

### Navigation
- [ ] GoRouter with typed routes
- [ ] Auth guards via redirect
- [ ] Deep linking support
- [ ] State preservation across routes

### Performance
- [ ] Profile mode testing (`flutter run --profile`)
- [ ] <16ms frame rendering time
- [ ] No unnecessary rebuilds (DevTools check)
- [ ] Images cached and resized
- [ ] Heavy computation in isolates

### Testing
- [ ] Widget tests for UI components
- [ ] Unit tests for business logic
- [ ] Integration tests for user flows
- [ ] Bloc tests with `blocTest()`

## References

| Topic | Reference |
|-------|-----------|
| Widget patterns, const optimization, responsive layout | [Widget Patterns](references/widget-patterns.md) |
| Riverpod providers, notifiers, async state | [Riverpod State Management](references/riverpod-state.md) |
| Bloc, Cubit, event-driven state | [Bloc State Management](references/bloc-state.md) |
| GoRouter setup, routes, deep linking | [GoRouter Navigation](references/gorouter-navigation.md) |
| Feature-based structure, dependencies | [Project Structure](references/project-structure.md) |
| Profiling, const optimization, DevTools | [Performance Optimization](references/performance.md) |
| Widget tests, integration tests, mocking | [Testing Strategies](references/testing.md) |
| iOS/Android/Web specific implementations | [Platform Integration](references/platform-specific.md) |
| Implicit/explicit animations, Hero, transitions | [Animations](references/animations.md) |
| Dio, interceptors, error handling, caching | [Networking](references/networking.md) |
| Form validation, FormField, input formatters | [Forms](references/forms.md) |
| i18n, flutter_localizations, intl | [Localization](references/localization.md) |

---

Flutter, Dart, Material Design, and Cupertino are trademarks of Google LLC and Apple Inc. respectively. Riverpod, Bloc, and GoRouter are open-source packages by their respective maintainers.
