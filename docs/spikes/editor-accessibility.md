# Editor Accessibility Spike

Status: **IMPLEMENTED - human screen-reader acceptance deferred**

## Device And System

- Android 16/API 36 emulator.
- Resolution/density: 1080 x 2400 at 420 dpi.
- TalkBack package is installed but a complete human auditory walkthrough was not performed.
- VoiceOver/iOS: unavailable.

## Minimum Reproduction

- src/app/editor-workspace-screen.tsx
- src/app/mode-switch.tsx
- src/app/app-shell-screen.tsx
- artifacts/spikes/phase1-recovered-direct.xml
- artifacts/spikes/phase1-recovered-direct.png

Capture the UI hierarchy with uiautomator dump and pull it into artifacts/spikes.

The captured hierarchy is now checked automatically by `tests/unit/scripts/android-accessibility-artifact.test.ts` during `npm test`.

## Steps And Results

The first hierarchy audit found:

- 13 clickable nodes;
- one unlabeled WebView;
- three mode controls at 40 dp height.

The implementation added a native Markdown editor label and raised mode controls to 48 dp. The rebuilt hierarchy then reported:

- 13 clickable nodes;
- zero unlabeled clickable nodes;
- zero clickable nodes below 48 dp in width or height.

The repeatable host audit also verifies that the named Markdown editor region remains present around the WebView.

Workspace guide also has one labeled 200 x 48 dp action.

## Remaining Human Matrix

- TalkBack and VoiceOver focus order, announcements, rotor/navigation, edit gestures, and modal focus return.
- WYSIWYG semantics for headings, lists, tasks, tables, links, and code.
- Source editor line/selection announcements.
- Dynamic text, bold text, high contrast, reduced motion, landscape, tablet, and keyboard visibility.
- Simplified Chinese and English localization.

## Failure Modes

- Editor content announced without its role/context.
- Focus trapped inside WebView or lost during mode change.
- Visual save/conflict state lacks equivalent spoken announcement.
- Toolbar order differs from visual order.
- Dynamic type clips controls or hides the active edit surface.

## Architecture Decision

Keep native navigation and status controls semantically labeled and at least 48 dp on Android/44 pt on iOS. Treat the WebView as an explicitly named editor region and implement editor-internal ARIA semantics. UIAutomator is a structural check only; release still requires human TalkBack/VoiceOver walkthroughs.

## Threshold Impact

No touch-target or accessibility requirement is relaxed. The hierarchy now meets the Android target, but Phase 1 remains open until both screen readers are tested.

## Data Safety Invariants

- Save, recovery, error, and conflict state must be conveyed by text/semantics, not color alone.
- Accessibility actions must call the same validated command/session paths as touch actions.
