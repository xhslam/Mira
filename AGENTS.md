# Repository Guidelines

**Last updated:** 2026-07-30

## Project Structure & Module Organization

This repository contains an Android-first Expo 57 React Native application. `index.ts` registers the root component in `App.tsx`. Application code lives in `src/`, organized by domain: `app/` contains the screen and theme, while `domain/`, `editor-bridge/`, `markdown/`, `session/`, and `workspace/` contain framework-light business logic. Tests mirror these areas under `tests/unit/`; shared behavioral contracts are in `tests/contracts/`, and Markdown samples are in `tests/fixtures/`. Static application artwork belongs in `assets/`. Architecture decisions and project handoff notes live in `docs/`.

## Build, Test, and Development Commands

- `npm ci`: install the exact dependency versions from `package-lock.json`.
- `npm start`: launch the Expo/Metro development server.
- `npm run android`, `npm run ios`, `npm run web`: open the selected Expo target.
- `npm test`: run the Vitest suite once; use `npm run test:watch` while developing.
- `npm run lint`: apply the Expo ESLint configuration.
- `npm run typecheck`: check strict TypeScript without emitting files.
- `npm run format:check`: verify Prettier formatting; `npm run format` rewrites files.
- `npx expo export --platform android`: verify Android bundle generation in `dist/`; this does not build an APK.

## Coding Style & Naming Conventions

Use TypeScript with two-space indentation, semicolons, and Prettier defaults. Keep modules small and domain-focused. File names use kebab-case (`workspace-path.ts`), React components and exported types use PascalCase, and functions use camelCase. Treat values as immutable: prefer `Readonly` types, frozen results, and new objects over mutation. Validate unknown input at system boundaries and return explicit, typed errors. The compiler enables `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`; do not weaken these settings.

## Testing Guidelines

Vitest runs in the Node environment and discovers `tests/**/*.test.ts`. Name tests after the source unit, for example `tests/unit/workspace/workspace-path.test.ts`. Cover successful behavior, invalid boundary inputs, and immutability guarantees. Reuse contract suites when multiple repository implementations must behave identically. Run `npm test`, lint, formatting checks, and type checking before submitting changes.

## Maintenance & Regression History

Before changing persistence, editor focus/IME behavior, WebView security, Markdown math, or Android release packaging, read `docs/maintenance-history.md` and the linked incident/ADR records. Their long-term invariants are release requirements, not optional implementation notes. Every bug fix must add a regression test and update the maintenance ledger; physical-device, security-boundary, data-integrity, or standalone-release failures also require an incident record. Do not remove an existing regression guard without documenting the replacement evidence and updating the related ADR.

## Commit & Pull Request Guidelines

Follow the existing Conventional Commit style: `feat: add mobile editor workspace shell`, `fix: respect mobile safe areas`, or `docs: hand off foundation`. Keep commits focused and written in the imperative mood. Pull requests should explain the user-visible and architectural impact, link relevant issues or design notes, list verification commands, and include screenshots for UI changes. Never commit secrets, generated `dist/` output, or machine-specific configuration.
