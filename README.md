# Schematic Viewer

A small, fast desktop app for previewing classic Minecraft `.schematic` files in 3D.

Open a schematic from the File menu, drag it into the window, or associate `.schematic` files with the app and open them directly from your file manager.

## Features

- Interactive orbit, pan, and zoom controls
- Native Windows, macOS, and Linux applications
- Double-click file association
- File picker and drag-and-drop opening
- Efficient instanced rendering for large structures
- Gzip-compressed and uncompressed NBT support
- Classic block IDs and `AddBlocks` extended IDs
- Model dimensions and non-air block count

## Controls

| Action | Control |
| --- | --- |
| Rotate | Left mouse drag |
| Pan | Right mouse drag |
| Zoom | Mouse wheel |
| Open file | `Ctrl+O` / `Cmd+O` |

## Supported formats

This release supports classic MCEdit/Schematica `.schematic` files. Sponge and WorldEdit `.schem` files are not supported yet.

## Development

Install [Node.js 22 or newer](https://nodejs.org/) and enable pnpm:

```powershell
corepack enable
corepack prepare pnpm@11.9.0 --activate
```

Then install dependencies and start the development app:

```powershell
pnpm install
pnpm dev
```

## Building locally

```powershell
pnpm build
```

Installers are written to `release/`. Build on the operating system you want to target.

## Automated builds

The GitHub Actions workflow builds on real hosted Windows, macOS, and Linux runners. Open the repository's **Actions** tab, select **Build desktop apps**, and choose **Run workflow**. Download the resulting installers from the run's **Artifacts** section.

The macOS artifact is currently unsigned. macOS users must explicitly allow it through Gatekeeper. Public distribution without that warning requires an Apple Developer certificate and notarization credentials.

## Roadmap

- Minecraft block textures and improved block geometry
- Sponge/WorldEdit `.schem` support
- Windows Explorer thumbnails and Preview pane integration
- Render-to-image export

## Windows Explorer previews

Explorer thumbnails and its Preview pane require a signed native COM shell extension. File association and direct opening are supported today; shell previews are planned as a separate Windows component.
