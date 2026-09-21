#!/usr/bin/env python3
"""Derive Schemy's flat block colours from a vanilla Minecraft client JAR.

Only RGB averages are written to the repository. Mojang texture assets remain
inside the user's locally installed client JAR.
"""

from __future__ import annotations

import argparse
import io
import json
import zipfile
from functools import lru_cache
from pathlib import Path
from typing import Any

from PIL import Image


def resource_path(value: str, category: str, extension: str) -> str:
    namespace, separator, name = value.partition(":")
    if not separator:
        namespace, name = "minecraft", namespace
    return f"assets/{namespace}/{category}/{name}{extension}"


class PaletteGenerator:
    def __init__(self, jar: Path):
        self.jar = zipfile.ZipFile(jar)
        self.names = set(self.jar.namelist())
        self.grass_tint = self.colormap_tint("grass", 0.8, 0.4, (145, 189, 89))
        self.foliage_tint = self.colormap_tint("foliage", 0.8, 0.4, (119, 171, 47))

    def read_json(self, path: str) -> dict[str, Any] | None:
        try:
            return json.loads(self.jar.read(path))
        except (KeyError, json.JSONDecodeError):
            return None

    def colormap_tint(
        self,
        name: str,
        temperature: float,
        downfall: float,
        fallback: tuple[int, int, int],
    ) -> tuple[int, int, int]:
        path = f"assets/minecraft/textures/colormap/{name}.png"
        try:
            with Image.open(io.BytesIO(self.jar.read(path))) as image:
                image = image.convert("RGB")
                x = round((1.0 - temperature) * (image.width - 1))
                y = round((1.0 - downfall * temperature) * (image.height - 1))
                return image.getpixel((x, y))
        except (KeyError, OSError):
            return fallback

    @lru_cache(maxsize=None)
    def model(self, name: str) -> dict[str, Any] | None:
        path = resource_path(name, "models", ".json")
        child = self.read_json(path)
        if not child:
            return None
        parent = self.model(child["parent"]) if isinstance(child.get("parent"), str) else None
        result: dict[str, Any] = dict(parent or {})
        result["textures"] = {
            **((parent or {}).get("textures") or {}),
            **(child.get("textures") or {}),
        }
        for key, value in child.items():
            if key not in {"parent", "textures"}:
                result[key] = value
        return result

    @staticmethod
    def model_names(value: Any) -> set[str]:
        result: set[str] = set()
        if isinstance(value, dict):
            model = value.get("model")
            if isinstance(model, str):
                result.add(model)
            for child in value.values():
                result.update(PaletteGenerator.model_names(child))
        elif isinstance(value, list):
            for child in value:
                result.update(PaletteGenerator.model_names(child))
        return result

    @staticmethod
    def resolve_texture(value: str, textures: dict[str, str]) -> str | None:
        seen: set[str] = set()
        while value.startswith("#"):
            key = value[1:]
            if key in seen:
                return None
            seen.add(key)
            value = textures.get(key, "")
            if not value:
                return None
        return value

    @staticmethod
    def tint_for(block: str, tinted: bool, grass: tuple[int, int, int], foliage: tuple[int, int, int]) -> tuple[int, int, int]:
        if not tinted:
            return (255, 255, 255)
        if "spruce_leaves" in block:
            return (97, 153, 97)
        if "birch_leaves" in block:
            return (128, 167, 85)
        if "leaves" in block or block in {"vine", "cave_vines", "cave_vines_plant"}:
            return foliage
        return grass

    @lru_cache(maxsize=None)
    def texture_average(self, name: str) -> tuple[float, float, float, float] | None:
        path = resource_path(name, "textures", ".png")
        try:
            with Image.open(io.BytesIO(self.jar.read(path))) as source:
                image = source.convert("RGBA")
                # Animated block textures stack square frames vertically.
                if image.height > image.width and image.height % image.width == 0:
                    image = image.crop((0, 0, image.width, image.width))
                red = green = blue = alpha = 0.0
                pixels = image.get_flattened_data() if hasattr(image, "get_flattened_data") else image.getdata()
                for r, g, b, a in pixels:
                    weight = a / 255.0
                    red += r * weight
                    green += g * weight
                    blue += b * weight
                    alpha += weight
                if alpha == 0:
                    return None
                coverage = alpha / (image.width * image.height)
                return red / alpha, green / alpha, blue / alpha, coverage
        except (KeyError, OSError):
            return None

    @staticmethod
    def face_area(element: dict[str, Any], direction: str) -> float:
        start, end = element.get("from", [0, 0, 0]), element.get("to", [16, 16, 16])
        dx, dy, dz = (abs(float(end[i]) - float(start[i])) for i in range(3))
        if direction in {"up", "down"}:
            return dx * dz
        if direction in {"north", "south"}:
            return dx * dy
        return dz * dy

    def model_average(self, block: str, name: str) -> tuple[float, float, float, float] | None:
        model = self.model(name)
        if not model:
            return None
        textures = model.get("textures") or {}
        defining_top = {
            "grass_block",
            "mycelium",
            "podzol",
            "crimson_nylium",
            "warped_nylium",
            "dirt_path",
            "farmland",
        }
        if block in defining_top and isinstance(textures.get("top"), str):
            resolved = self.resolve_texture(textures["top"], textures)
            average = self.texture_average(resolved) if resolved else None
            if average:
                r, g, b, coverage = average
                tint = self.tint_for(block, block == "grass_block", self.grass_tint, self.foliage_tint)
                return r * tint[0] / 255.0, g * tint[1] / 255.0, b * tint[2] / 255.0, coverage
        samples: list[tuple[float, float, float, float]] = []
        for element in model.get("elements") or []:
            for direction, face in (element.get("faces") or {}).items():
                texture = face.get("texture")
                if not isinstance(texture, str):
                    continue
                resolved = self.resolve_texture(texture, textures)
                average = self.texture_average(resolved) if resolved else None
                if not average:
                    continue
                r, g, b, coverage = average
                tint = self.tint_for(block, "tintindex" in face, self.grass_tint, self.foliage_tint)
                weight = self.face_area(element, direction) * coverage
                samples.append((r * tint[0] / 255.0, g * tint[1] / 255.0, b * tint[2] / 255.0, weight))
        if not samples:
            # Entity-rendered and unusual models can still expose a useful texture.
            for key, value in textures.items():
                if key == "particle" or not isinstance(value, str):
                    continue
                resolved = self.resolve_texture(value, textures)
                average = self.texture_average(resolved) if resolved else None
                if average:
                    r, g, b, coverage = average
                    samples.append((r, g, b, coverage))
        weight = sum(sample[3] for sample in samples)
        if weight == 0:
            return None
        return (
            sum(sample[0] * sample[3] for sample in samples) / weight,
            sum(sample[1] * sample[3] for sample in samples) / weight,
            sum(sample[2] * sample[3] for sample in samples) / weight,
            weight,
        )

    def block_average(self, block: str, state: dict[str, Any]) -> int | None:
        model_names = self.model_names(state)
        if block == "grass_block":
            model_names = {name for name in model_names if not name.endswith("_snow")}
        samples = [
            average
            for model_name in sorted(model_names)
            if (average := self.model_average(block, model_name))
        ]
        if not samples:
            return None
        # Variant models represent alternative states, so weight them equally.
        red = sum(sample[0] for sample in samples) / len(samples)
        green = sum(sample[1] for sample in samples) / len(samples)
        blue = sum(sample[2] for sample in samples) / len(samples)
        return (round(red) << 16) | (round(green) << 8) | round(blue)

    def generate(self) -> dict[str, int]:
        result: dict[str, int] = {}
        prefix, suffix = "assets/minecraft/blockstates/", ".json"
        for path in sorted(self.names):
            if not path.startswith(prefix) or not path.endswith(suffix):
                continue
            block = path[len(prefix) : -len(suffix)]
            state = self.read_json(path)
            color = self.block_average(block, state) if state else None
            if color is not None:
                result[block] = color
        return result


def minecraft_version(jar: Path) -> str:
    try:
        with zipfile.ZipFile(jar) as archive:
            version = json.loads(archive.read("version.json")).get("name")
            if isinstance(version, str):
                return version
    except (KeyError, json.JSONDecodeError):
        pass
    return jar.stem


def write_typescript(output: Path, colors: dict[str, int], version: str) -> None:
    lines = [
        "// Generated by tools/generate-texture-colors.py.",
        f"// Source: locally installed vanilla Minecraft {version} client assets.",
        "// Contains derived RGB averages only; no Minecraft textures are redistributed.",
        "export const textureAverageColors:Readonly<Record<string,number>>={",
    ]
    lines.extend(f"  {json.dumps(name)}:0x{color:06x}," for name, color in colors.items())
    lines.append("};")
    output.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("jar", type=Path, help="Path to a vanilla Minecraft client JAR")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("src/texture-colors.ts"),
        help="Generated TypeScript output",
    )
    args = parser.parse_args()
    generator = PaletteGenerator(args.jar)
    colors = generator.generate()
    write_typescript(args.output, colors, minecraft_version(args.jar))
    print(
        f"Wrote {len(colors)} block colours to {args.output} "
        f"(grass tint #{generator.grass_tint[0]:02x}{generator.grass_tint[1]:02x}{generator.grass_tint[2]:02x}, "
        f"foliage tint #{generator.foliage_tint[0]:02x}{generator.foliage_tint[1]:02x}{generator.foliage_tint[2]:02x})"
    )


if __name__ == "__main__":
    main()
