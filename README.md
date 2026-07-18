# Schemy

[![Build desktop apps](https://github.com/Sablednah/Schemy/actions/workflows/build.yml/badge.svg)](https://github.com/Sablednah/Schemy/actions/workflows/build.yml)

A small, fast desktop app for previewing Minecraft structure files in 3D on Windows, macOS, and Linux.

Open a structure from the File menu, drag it into the window, or associate a supported file type with Schemy and open it directly from your file manager.

## Features

- Interactive orbit, pan, and zoom controls
- Native Windows, macOS, and Linux packages
- Double-click file associations
- File picker and drag-and-drop opening
- Efficient instanced rendering for large structures
- Original colour preview plus optional generated pixel textures
- Gzip-compressed and uncompressed NBT support
- Model format, dimensions, and non-air block count
- Automatic format detection from NBT contents

## Supported formats

| Extension | Format | Support |
| --- | --- | --- |
| `.schematic` | Classic MCEdit/Schematica | Legacy block IDs, including `AddBlocks` extended IDs |
| `.schem` | Sponge/WorldEdit v1–v3 | Modern palettes, block states, and varint block data |
| `.nbt` | Vanilla Java structure block | Palettes, properties, and sparse block positions |
| `.litematic` | Litematica | Packed 64-bit block states and multiple positioned regions |

Block and entity NBT is read safely but is not visually rendered yet. Schemy currently represents blocks as full cubes, so stairs, slabs, fences, panes, plants, doors, and similar blocks do not yet have their exact Minecraft geometry.

## Controls

| Action | Control |
| --- | --- |
| Rotate | Left mouse drag |
| Pan | Right mouse drag |
| Zoom | Mouse wheel |
| Open file | `Ctrl+O` / `Cmd+O` |
| Change appearance | **Textures: On/Off** button |

The texture mode is generated locally and does not redistribute Mojang texture assets. The original colour rendering remains the default.

## Development

Install [Node.js 22 or newer](https://nodejs.org/) and enable pnpm:

```powershell
corepack enable
corepack prepare pnpm@11.9.0 --activate
```

Install dependencies and start the development app:

```powershell
pnpm install
pnpm dev
```

Run the parser tests:

```powershell
pnpm test
```

## Building locally

```powershell
pnpm build
```

Installers are written to `release/`. Build on the operating system you want to target.

## Automated builds

The [GitHub Actions workflow](https://github.com/Sablednah/Schemy/actions/workflows/build.yml) tests the parsers and builds on real hosted Windows, macOS, and Linux runners. Open a successful run and download the package for your platform from its **Artifacts** section.

The macOS artifact is currently unsigned. macOS users must explicitly allow it through Gatekeeper. Public distribution without that warning requires Apple Developer signing and notarization.

## Roadmap

- Accurate geometry for non-cube blocks
- Optional user-supplied Minecraft resource packs
- Block entity and entity previews
- Windows Explorer thumbnails and Preview pane integration
- Render-to-image export

## Windows Explorer previews

Explorer thumbnails and its Preview pane require a signed native COM shell extension. File association and direct opening are supported today; shell previews are planned as a separate Windows component.
