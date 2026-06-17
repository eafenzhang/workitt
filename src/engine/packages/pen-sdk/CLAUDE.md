# pen-sdk

Umbrella SDK that re-exports all OpenPencil packages from a single entry point.

## Structure

- `src/index.ts` — Single barrel file re-exporting from:
  - `@minopencil/pen-types` — All document model types and codegen types
  - `@minopencil/pen-core` — Tree operations, layout engine, variables, normalization, boolean ops
  - `@minopencil/pen-engine` — `DesignEngine` and all managers
  - `@minopencil/pen-react` — All hooks, components, and stores (`export *`)
  - `@minopencil/pen-renderer` — `PenRenderer`, CanvasKit loader, low-level rendering utilities
  - `@minopencil/pen-figma` — Figma file parser and converter

## Usage

```ts
import {
  type PenDocument,
  createEmptyDocument,
  DesignEngine,
  DesignProvider,
  useDocument,
  PenRenderer,
  parseFigFile,
} from '@minopencil/pen-sdk';
```

Consumers can import from `@minopencil/pen-sdk` instead of individual packages. All types, runtime exports, and React hooks are available.
