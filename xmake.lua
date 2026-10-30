-- COG core SKSE plugin + Prisma view deploy (repo staging; release.ps1 zips from here).
local deploy_root = path.join(os.projectdir(), "_stage", "COG - Custom Overlay Gadgets")
local cog_dir = os.scriptdir()

target("COG")
	add_deps("commonlibsse-ng")

	add_rules("commonlibsse-ng.plugin", {
		name = "COG",
		author = "WesternWolff",
		description = "Custom Overlay Gadgets — Prisma UI HUD toolkit"
	})

	add_files("src/**.cpp")
	add_headerfiles("src/**.h")
	add_includedirs("src")
	set_pcxxheader("src/pch.h")
	add_syslinks("windowscodecs", "ole32")

	before_build(function (target)
		os.execv("dotnet", {
			"run",
			"--project", path.join(os.projectdir(), "tools", "MakeBuiltinEsp", "MakeBuiltinEsp.csproj"),
			"-c", "Release",
			"--",
			path.join(cog_dir, "plugin", "COG - Custom Overlay Gadgets.esp")
		})
	end)

	after_build(function (target)
		local plugin_dir = path.join(deploy_root, "SKSE", "Plugins")
		local view_dir = path.join(deploy_root, "PrismaUI", "views", "COG")
		os.mkdir(plugin_dir)
		os.mkdir(view_dir)
		os.cp(target:targetfile(), plugin_dir)
		local pdb = path.join(path.directory(target:targetfile()), path.basename(target:targetfile()) .. ".pdb")
		if os.isfile(pdb) then
			os.cp(pdb, plugin_dir)
		end
		os.cp(path.join(cog_dir, "view/index.html"), path.join(view_dir, "overlay.html"))
		for _, css in ipairs(os.files(path.join(cog_dir, "view/_*.css"))) do
			os.cp(css, view_dir)
		end
		-- Drop pre-rename deploy leftovers.
		for _, legacy in ipairs({ "style.css", "script.js", "index.html", "Cog.js", "Cog.css" }) do
			local legacy_path = path.join(view_dir, legacy)
			if os.isfile(legacy_path) then
				os.rm(legacy_path)
			end
		end
		-- Drop old Cog_*.css names after rename to _*.css.
		for _, css in ipairs(os.files(path.join(view_dir, "Cog_*.css"))) do
			os.rm(css)
		end
		for _, file in ipairs(os.files(path.join(cog_dir, "view/_*.js"))) do
			os.cp(file, view_dir)
		end
		-- Drop staged _*.js that are no longer in source (e.g. rolled-back split shards).
		do
			local src_names = {}
			for _, file in ipairs(os.files(path.join(cog_dir, "view/_*.js"))) do
				src_names[path.filename(file)] = true
			end
			for _, file in ipairs(os.files(path.join(view_dir, "_*.js"))) do
				if not src_names[path.filename(file)] then
					os.rm(file)
				end
			end
		end
		os.mkdir(path.join(view_dir, "help"))
		if os.isdir(path.join(cog_dir, "view/help")) then
			for _, file in ipairs(os.files(path.join(view_dir, "help/*"))) do
				os.rm(file)
			end
			for _, file in ipairs(os.files(path.join(cog_dir, "view/help/*.md"))) do
				os.cp(file, path.join(view_dir, "help"))
			end
		end
		local icons_dir = path.join(view_dir, "assets", "icons")
		os.mkdir(icons_dir)
		-- Refresh shipped icon folders; leave runtime imports (e.g. iWant_*) intact.
		local icons_src = path.join(cog_dir, "view/assets/icons")
		local shipped_dirs = {}
		if os.isdir(icons_src) then
			for _, dir in ipairs(os.dirs(path.join(icons_src, "*"))) do
				shipped_dirs[#shipped_dirs + 1] = path.filename(dir)
			end
		end
		local function is_shipped(name)
			for _, shipped in ipairs(shipped_dirs) do
				if shipped == name then
					return true
				end
			end
			return false
		end
		-- Drop dest folders that are no longer shipped (runtime imports live under assets/imports/).
		if os.isdir(icons_dir) then
			for _, dir in ipairs(os.dirs(path.join(icons_dir, "*"))) do
				local name = path.filename(dir)
				if not is_shipped(name) then
					os.rmdir(dir)
				end
			end
		end
		for _, name in ipairs(shipped_dirs) do
			local dest_sub = path.join(icons_dir, name)
			if os.isdir(dest_sub) then
				os.rmdir(dest_sub)
			end
		end
		-- Clear loose files at icons root (not subfolders).
		for _, file in ipairs(os.files(path.join(icons_dir, "*"))) do
			os.rm(file)
		end
		if os.isfile(path.join(cog_dir, "view/assets/cog.png")) then
			os.cp(path.join(cog_dir, "view/assets/cog.png"), path.join(view_dir, "assets"))
		end
		if os.isdir(icons_src) then
			for _, file in ipairs(os.files(path.join(icons_src, "**"))) do
				local rel = path.relative(file, icons_src):gsub("\\", "/")
				local dest = path.join(view_dir, "assets", "icons", rel)
				os.mkdir(path.directory(dest))
				os.cp(file, dest)
			end
		end
		-- Drop legacy deploy-time icon manifest; the overlay lists icons live from disk.
		local legacy_manifest = path.join(icons_dir, "manifest.json")
		if os.isfile(legacy_manifest) then
			os.rm(legacy_manifest)
		end
		local fonts_dir = path.join(view_dir, "assets", "fonts")
		if os.isdir(fonts_dir) then
			os.rmdir(fonts_dir)
		end
		os.mkdir(fonts_dir)
		local fonts_src = path.join(cog_dir, "view/assets/fonts")
		if os.isdir(fonts_src) then
			for _, file in ipairs(os.files(path.join(fonts_src, "*"))) do
				local ext = string.lower(path.extension(file))
				if ext == ".ttf" or ext == ".otf" or ext == ".woff" or ext == ".woff2" then
					os.cp(file, path.join(fonts_dir, path.filename(file)))
				end
			end
		end
		-- Runtime import trees (never wiped on deploy; ship empty placeholders).
		local imports_src = path.join(cog_dir, "view/assets/imports")
		if os.isdir(imports_src) then
			for _, file in ipairs(os.files(path.join(imports_src, "**"))) do
				local rel = path.relative(file, imports_src):gsub("\\", "/")
				local dest = path.join(view_dir, "assets", "imports", rel)
				os.mkdir(path.directory(dest))
				os.cp(file, dest)
			end
		end
		local cog_data = path.join(deploy_root, "SKSE", "Plugins", "COG")
		os.mkdir(path.join(cog_data, "groups"))
		os.mkdir(path.join(cog_data, "gears"))
		os.mkdir(path.join(cog_data, "gauges"))
		os.mkdir(path.join(cog_data, "gizmos"))
		os.mkdir(path.join(cog_data, "gizmoTypes", "cog-feed", "inventory"))
		os.mkdir(path.join(cog_data, "gizmoTypes", "cog-feed", "effects"))
		os.mkdir(path.join(cog_data, "gizmoTypes", "cog-feed", "skills"))
		os.mkdir(path.join(cog_data, "gizmoTypes", "cog-feed", "location"))
		os.mkdir(path.join(cog_data, "translations"))
		local translations_src = path.join(cog_dir, "plugin/translations/_COG.json")
		if os.isfile(translations_src) then
			os.cp(translations_src, path.join(cog_data, "translations", "_COG.json"))
		end
		-- Per-type translation packs (gizmoTypes/<typeId>/translations/*.json).
		local gizmo_types_with_i18n = { "cog-clock", "cog-feed", "cog-shout-meter", "cog-suppressor" }
		for _, type_id in ipairs(gizmo_types_with_i18n) do
			local pack_src = path.join(cog_dir, "plugin/gizmoTypes", type_id, "translations")
			local pack_dst = path.join(cog_data, "gizmoTypes", type_id, "translations")
			if os.isdir(pack_src) then
				os.mkdir(pack_dst)
				for _, file in ipairs(os.files(path.join(pack_src, "*.json"))) do
					os.cp(file, path.join(pack_dst, path.filename(file)))
				end
			end
		end

		-- Drop legacy assets/endcaps deploy (now icons/Endcaps).
		local legacy_endcaps = path.join(view_dir, "assets", "endcaps")
		if os.isdir(legacy_endcaps) then
			os.rmdir(legacy_endcaps)
		end
		-- Always refresh shipped inventory icon defaults; never touch other *.txt overrides.
		local inv_icons_src = path.join(cog_dir, "plugin/gizmoTypes/cog-feed/inventory/_COG.txt")
		if os.isfile(inv_icons_src) then
			os.cp(inv_icons_src, path.join(cog_data, "gizmoTypes", "cog-feed", "inventory", "_COG.txt"))
		end
		-- Always refresh shipped active-effects icon defaults; never touch other *.txt overrides.
		local fx_icons_src = path.join(cog_dir, "plugin/gizmoTypes/cog-feed/effects/_COG.txt")
		if os.isfile(fx_icons_src) then
			os.cp(fx_icons_src, path.join(cog_data, "gizmoTypes", "cog-feed", "effects", "_COG.txt"))
		end
		-- Always refresh shipped skills icon defaults; never touch other *.txt overrides.
		local skills_icons_src = path.join(cog_dir, "plugin/gizmoTypes/cog-feed/skills/_COG.txt")
		if os.isfile(skills_icons_src) then
			os.cp(skills_icons_src, path.join(cog_data, "gizmoTypes", "cog-feed", "skills", "_COG.txt"))
		end
		-- Always refresh shipped location icon defaults; never touch other *.txt overrides.
		local loc_icons_src = path.join(cog_dir, "plugin/gizmoTypes/cog-feed/location/_COG.txt")
		if os.isfile(loc_icons_src) then
			os.cp(loc_icons_src, path.join(cog_data, "gizmoTypes", "cog-feed", "location", "_COG.txt"))
		end
		-- Always refresh shipped notification icon defaults; never touch other *.txt overrides.
		local notif_icons_src = path.join(cog_dir, "plugin/gizmoTypes/cog-feed/notifications/_COG.txt")
		if os.isfile(notif_icons_src) then
			os.mkdir(path.join(cog_data, "gizmoTypes", "cog-feed", "notifications"))
			os.cp(notif_icons_src, path.join(cog_data, "gizmoTypes", "cog-feed", "notifications", "_COG.txt"))
		end
		-- Do not leave legacy type-storage trees under gizmos/ (Migration Code moves player data at load).
		for _, stale in ipairs({
			path.join(cog_data, "gizmos", "feed"),
			path.join(cog_data, "gizmos", "cog-feed"),
			path.join(cog_data, "gizmos", "cog-clock")
		}) do
			if os.isdir(stale) then
				os.rm(stale)
			end
		end
		local function copy_if_missing(src, dst)
			if os.isfile(src) and not os.isfile(dst) then
				os.cp(src, dst)
			end
		end
		copy_if_missing(path.join(cog_dir, "config/general.json"), path.join(cog_data, "general.json"))
		-- Default Group is created on first load (SaveConfig → Overwrite). Do not ship it in the
		-- mod folder — that copy is wiped on reinstall while Overwrite-written groups survive.
		local shipped_default = path.join(cog_data, "groups", "default.json")
		if os.isfile(shipped_default) then
			os.rm(shipped_default)
		end
		-- Blank seen.json ships with the mod so reinstall resets the mod copy. Runtime writes
		-- still land in Overwrite; wipe Overwrite seen.json too if you need a full offer reset.
		local seen_src = path.join(cog_dir, "config/seen.json")
		if os.isfile(seen_src) then
			os.cp(seen_src, path.join(cog_data, "seen.json"))
		end
		for _, file in ipairs(os.files(path.join(cog_dir, "config/gears/*.json"))) do
			copy_if_missing(file, path.join(cog_data, "gears", path.filename(file)))
		end
		for _, file in ipairs(os.files(path.join(cog_dir, "config/gauges/*.json"))) do
			copy_if_missing(file, path.join(cog_data, "gauges", path.filename(file)))
		end
		os.mkdir(path.join(deploy_root, "Scripts"))
		os.mkdir(path.join(deploy_root, "Source", "Scripts"))
		local api_pex = path.join(cog_dir, "papyrus/pex/COG_API.pex")
		local feed_api_pex = path.join(cog_dir, "papyrus/pex/COG_Feed_API.pex")
		if os.isfile(api_pex) and os.isfile(feed_api_pex) then
			os.cp(api_pex, path.join(deploy_root, "Scripts"))
			os.cp(feed_api_pex, path.join(deploy_root, "Scripts"))
			os.cp(path.join(cog_dir, "papyrus/COG_API.psc"), path.join(deploy_root, "Source", "Scripts"))
			os.cp(path.join(cog_dir, "papyrus/COG_Feed_API.psc"), path.join(deploy_root, "Source", "Scripts"))
			-- Drop retired COG_Builtin (native EnsureBuiltinSources owns COG.Builtin now).
			local legacy_builtin_pex = path.join(deploy_root, "Scripts", "COG_Builtin.pex")
			local legacy_builtin_psc = path.join(deploy_root, "Source", "Scripts", "COG_Builtin.psc")
			if os.isfile(legacy_builtin_pex) then
				os.rm(legacy_builtin_pex)
			end
			if os.isfile(legacy_builtin_psc) then
				os.rm(legacy_builtin_psc)
			end
		else
			print("warning: Papyrus .pex missing under _cog/papyrus/pex/ — Scripts not updated. Run tools/release.ps1 (or compile Papyrus first).")
		end
		if os.isfile(path.join(cog_dir, "plugin/COG - Custom Overlay Gadgets.esp")) then
			os.cp(path.join(cog_dir, "plugin/COG - Custom Overlay Gadgets.esp"), deploy_root)
			local legacy = path.join(deploy_root, "COG_Builtin.esp")
			if os.isfile(legacy) then
				os.rm(legacy)
			end
		end
		print("Deployed COG to " .. deploy_root)
	end)
