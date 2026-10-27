# Custom Overlay Gadgets (COG)

Prisma UI HUD toolkit for Skyrim Special Edition / Anniversary Edition.

**Public source:** <https://github.com/Western-Wolf/COG> · developing toward **v1.1** (tagged from **v1.01**)

This tree is the **product source** for GPL-3.0 compliance (core plugin, Prisma view, Papyrus, optional iWant + Example addons). Internal reviews, media, FOMOD packaging, and local build tooling live in the private monorepo that contains this folder.

## License

Copyright (C) 2026 WesternWolff

This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.

Full license text: [LICENSE.txt](LICENSE.txt) · <https://www.gnu.org/licenses/gpl-3.0.html>

COG links against [CommonLibSSE-NG](https://github.com/alandtse/CommonLibSSE-NG) and is therefore distributed under GPL-3.0.

## Layout

| Path | Contents |
|------|----------|
| `src/` | SKSE plugin (`COG.dll`) |
| `view/` | Prisma overlay (HTML/CSS/JS + shipped assets) |
| `papyrus/` | `COG_API` / `COG_Feed_API` sources |
| `plugin/` | Generated light-flagged ESP |
| `addons/iwant/` | Optional iWant Widgets / Status Bars bridge |
| `addons/example/` | Optional Papyrus `COG_API` example pack |
