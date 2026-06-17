# @minopencil/pen-sdk

The umbrella SDK for [OpenPencil](https://github.com/ZSeven-W/openpencil). One import gives you everything — types, document operations, headless engine, React components, code generation, Figma import, and GPU rendering.

## Install

```bash
npm install @minopencil/pen-sdk
# or
bun add @minopencil/pen-sdk
```

## Overview

`pen-sdk` re-exports all OpenPencil packages through a single entry point. Use it when you want the full stack without managing individual dependencies. For smaller bundles, install only the packages you need.

## What's Included

| Package                                     | Provides                                                                            |
| ------------------------------------------- | ----------------------------------------------------------------------------------- |
| [`@minopencil/pen-types`](../pen-types)       | TypeScript types for the document model (`PenDocument`, `PenNode`, `PenFill`, etc.) |
| [`@minopencil/pen-core`](../pen-core)         | Tree operations, layout engine, variables, boolean ops, normalization, 3-way merge  |
| [`@minopencil/pen-engine`](../pen-engine)     | Headless design engine — document, selection, history, viewport, spatial index      |
| [`@minopencil/pen-react`](../pen-react)       | React UI SDK — `DesignProvider`, `DesignCanvas`, 10 hooks, 39 components            |
| [`@minopencil/pen-renderer`](../pen-renderer) | CanvasKit/Skia GPU renderer with viewport, hit testing, font/image management       |
| [`@minopencil/pen-figma`](../pen-figma)       | Figma `.fig` binary parser and converter                                            |

## Usage

### Build a full editor

```tsx
import {
  DesignProvider,
  DesignCanvas,
  CoreToolbar,
  LayerPanel,
  PropertyPanel,
  useDocument,
  useSelection,
  useHistory,
} from '@minopencil/pen-sdk';

function Editor() {
  return (
    <DesignProvider initialDocument={myDoc}>
      <CoreToolbar />
      <DesignCanvas />
      <LayerPanel />
      <PropertyPanel />
    </DesignProvider>
  );
}
```

### Document operations

```typescript
import {
  type PenDocument,
  type PenNode,
  createEmptyDocument,
  findNodeInTree,
  insertNodeInTree,
  flattenNodes,
  normalizePenDocument,
  resolveNodeForCanvas,
} from '@minopencil/pen-sdk';

const doc = createEmptyDocument();
const node = findNodeInTree(doc.children, 'header');
```

### Headless engine (no React)

```typescript
import { DesignEngine } from '@minopencil/pen-sdk';

const engine = new DesignEngine();
engine.loadDocument(doc);
engine.addNode(null, { type: 'frame', name: 'Page', width: 1200, height: 800 });
engine.select(['node-1']);
engine.undo();
```

### Code generation

```typescript
import {
  generateReactFromDocument,
  generateHTMLFromDocument,
  generateFlutterFromDocument,
  generateVueFromDocument,
  generateSvelteFromDocument,
  generateSwiftUIFromDocument,
} from '@minopencil/pen-sdk';

const reactCode = generateReactFromDocument(doc);
const htmlCode = generateHTMLFromDocument(doc);
```

### Figma import

```typescript
import { parseFigFile, figmaAllPagesToPenDocument, isFigmaClipboardHtml } from '@minopencil/pen-sdk';

const figFile = parseFigFile(buffer);
const document = figmaAllPagesToPenDocument(figFile);
```

### GPU rendering (headless)

```typescript
import { loadCanvasKit, PenRenderer } from '@minopencil/pen-sdk';

await loadCanvasKit();
const renderer = new PenRenderer(canvas, document);
renderer.render();
```

## Individual Packages

For smaller bundles, install only what you need:

```bash
# Types only (zero runtime)
npm install @minopencil/pen-types

# Document operations (no rendering)
npm install @minopencil/pen-core

# Headless engine (no React)
npm install @minopencil/pen-engine

# React components
npm install @minopencil/pen-react

# GPU renderer
npm install @minopencil/pen-renderer canvaskit-wasm

# Figma import
npm install @minopencil/pen-figma
```

## License

[MIT](./LICENSE)
