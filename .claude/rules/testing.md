---
paths:
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "test/**"
  - "vitest.config.ts"
  - "vitest.emulator.config.ts"
---

# Testing

## Testing

Tests run on **Vitest** + **@testing-library/react** + **jsdom**.
Config is `vitest.config.ts`; shared setup is in `test/`.
We write **integration-style unit tests** — exercise a whole feature (an adapter's rules, a hook's composition, a component's interaction), not single trivial functions.
What the screens look like on each platform is the release screenshots' job (`npm run visual`, scripts/visual/README.md), and taps through the apps Maestro's (maestro/README.md).

### Where tests live

- **Co-locate** unit/component tests next to their source: `Foo.tsx` → `Foo.test.tsx`, `foo.ts` → `foo.test.ts`. This is the default.
- **`test/`** holds only shared infra, not test cases:
  - `test/setup.ts` – global setup (jest-dom matchers, `afterEach` cleanup, jsdom `ResizeObserver`/`matchMedia` stubs that organic atoms need via `useElementSize`/`useIsMobile`).
  - `test/fakeAdminDb.ts` – an in-memory Admin Firestore with a `reads` log, for rendering server pages and routes without the emulator.
  - `test/render.tsx` – `renderWithIntl()` wraps a component in `NextIntlClientProvider` (loads real `en` messages so assertions hit real copy); also re-exports the Testing Library surface + `userEvent`.

### Environment & the jsdom directive

Default env is **node** (fast – suits pure-logic suites). Any test that renders React must opt into jsdom with a top-of-file directive:

```ts
// @vitest-environment jsdom
```

`tsconfig.json` uses `jsx: "preserve"` for Next, so the Vitest config sets `esbuild.jsx: 'automatic'` – test files don't import React. `vitest.config.ts` is excluded from `npm run typecheck` (build tooling, dual-Vite type noise).

### Conventions

- **Mock at the module boundary**, not internals. Hooks/components that touch Firebase mock the read/write layer (`@/lib/db/firestore/client/*`), `useAuth`, and navigation (`@/i18n/navigation`) with `vi.mock`. Pure-logic suites (adapters, mappers, design utils) mock nothing.
- **SWR hooks**: render via `renderHook` wrapped in `<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>` so each test gets an isolated cache; `await waitFor(() => expect(result.current.data).toBeDefined())`.
  To test focus behaviour use `{ ...SWR_DEFAULTS, provider, dedupingInterval: 0, focusThrottleInterval: 0 }` (SWR ignores focus for 5 s after mount).
  When a hook returns the raw SWR object, read `.data` during render (`renderHook(() => useX().data)`) — SWR only re-renders for fields a render read.
  A component rendering CardLinkGrid needs `useAuth` mocked (the prefill reads the viewer).
- **Query by role / label / text**, asserting the behavior a user sees – avoid implementation details.
- **Component gotchas**: for a control gated by a `pointer-events: none` wrapper, use `userEvent.setup({ pointerEventsCheck: 0 })` to test the component's own validity gate. For long text input, prefer `fireEvent.change` over `userEvent.type`. Await async effects (e.g. a `useEffect` data load) before a test ends to avoid `act()` warnings.
- **Determinism**: seeded design utils (`prng`, `wobRect`, `wavyPath`) are tested for same-seed stability – this is what guarantees SSR/CSR hydration parity.
