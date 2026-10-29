-- COG Example API pack (Papyrus-only reference for public COG_API surface).
-- Four ESL-flagged ESPs: Core (icons + tick) / Gears / Feed / Gizmos.
-- Stages under repo `_stage/`; release.ps1 packs the FOMOD zip from there.
--
-- Note: helpers that call os.mkdir / os.cp / os.execv must live inside on_build —
-- description-scope `os` is sandboxed and does not expose mkdir.

local addon_dir = os.scriptdir()
local make_esp = path.join(os.projectdir(), "tools", "MakeExampleEsp", "MakeExampleEsp.csproj")

local modules = {
	{
		stage = "COG - Example Core",
		esp = "COG - Example Core.esp",
		quest_id = "COG_Example_CoreQuest",
		quest_name = "COG Example Core",
		script = "COG_Example_Core",
		alias = "COG_Example_Core_Alias",
		desc = "Description.Example.Core",
		scripts = { "COG_Example_Core", "COG_Example_Core_Alias" },
		core_assets = true
	},
	{
		stage = "COG - Example Gears",
		esp = "COG - Example Gears.esp",
		quest_id = "COG_Example_GearsQuest",
		quest_name = "COG Example Gears",
		script = "COG_Example_Gears",
		alias = "COG_Example_Gears_Alias",
		desc = "Description.Example.Gears",
		scripts = { "COG_Example_Gears", "COG_Example_Gears_Alias" },
		-- Global catalog override (SKSE/Plugins/COG/translations/) — name: keys for Example gears.
		name_translations = "Example.json"
	},
	{
		stage = "COG - Example Feed",
		esp = "COG - Example Feed.esp",
		quest_id = "COG_Example_FeedQuest",
		quest_name = "COG Example Feed",
		script = "COG_Example_Feed",
		alias = "COG_Example_Feed_Alias",
		desc = "Description.Example.Feed",
		scripts = { "COG_Example_Feed", "COG_Example_Feed_Alias" }
	},
	{
		stage = "COG - Example Gizmos",
		esp = "COG - Example Gizmos.esp",
		quest_id = "COG_Example_GizmosQuest",
		quest_name = "COG Example Gizmos",
		script = "COG_Example_Gizmos",
		alias = "COG_Example_Gizmos_Alias",
		desc = "Description.Example.Gizmos",
		scripts = { "COG_Example_Gizmos", "COG_Example_Gizmos_Alias" },
		views = true,
		gizmo_translations = true
	}
}

target("COG_Example")
	set_kind("phony")

	on_build(function (target)
		local function run_make_esp(out_path, plugin_file, quest_id, quest_name, script, alias_script, desc_key)
			os.mkdir(path.directory(out_path))
			os.execv("dotnet", {
				"run",
				"--project", make_esp,
				"-c", "Release",
				"--",
				out_path,
				plugin_file,
				quest_id,
				quest_name,
				script,
				alias_script,
				desc_key
			})
		end

		local function stage_scripts(deploy_root, script_names)
			os.mkdir(path.join(deploy_root, "Scripts"))
			os.mkdir(path.join(deploy_root, "Source", "Scripts"))
			for _, name in ipairs(script_names) do
				local psc = path.join(addon_dir, "papyrus", name .. ".psc")
				if os.isfile(psc) then
					os.cp(psc, path.join(deploy_root, "Source", "Scripts"))
				end
				local pex = path.join(addon_dir, "papyrus", "pex", name .. ".pex")
				if os.isfile(pex) then
					os.cp(pex, path.join(deploy_root, "Scripts"))
				else
					print("warning: missing " .. pex .. " — compile " .. name .. ".psc before runtime")
				end
			end
		end

		os.mkdir(path.join(addon_dir, "plugin"))

		for _, m in ipairs(modules) do
			local plugin_out = path.join(addon_dir, "plugin", m.esp)
			run_make_esp(
				plugin_out,
				m.esp,
				m.quest_id,
				m.quest_name,
				m.script,
				m.alias,
				m.desc
			)

			local deploy_root = path.join(os.projectdir(), "_stage", m.stage)
			-- Fresh stage folder each build (drop retired single-ESP layout leftovers).
			if os.isdir(deploy_root) then
				os.rmdir(deploy_root)
			end
			os.mkdir(deploy_root)
			os.cp(plugin_out, deploy_root)
			stage_scripts(deploy_root, m.scripts)

			if m.core_assets then
				local icon_dst = path.join(deploy_root, "Interface", "exported", "COG_Example")
				os.mkdir(icon_dst)
				os.cp(path.join(addon_dir, "assets", "light-bulb-fill.png"), path.join(icon_dst, "light-bulb-fill.png"))
				os.cp(path.join(addon_dir, "assets", "light-bulb-hollow.png"), path.join(icon_dst, "light-bulb-hollow.png"))
				-- Drop legacy pre-seeded import / old svg from older Example deploys.
				local legacy_import = path.join(deploy_root, "PrismaUI", "views", "COG", "assets", "imports", "icons", "COG_Example")
				if os.isdir(legacy_import) then
					os.rmdir(legacy_import)
				end
			end

			if m.views then
				local view_dst = path.join(deploy_root, "PrismaUI", "views", "Example")
				os.mkdir(view_dst)
				os.cp(path.join(addon_dir, "view", "example.js"), path.join(view_dst, "example.js"))
				os.cp(path.join(addon_dir, "view", "example_push.js"), path.join(view_dst, "example_push.js"))
			end

			if m.name_translations then
				local src = path.join(addon_dir, "translations", m.name_translations)
				if os.isfile(src) then
					local dst_dir = path.join(deploy_root, "SKSE", "Plugins", "COG", "translations")
					os.mkdir(dst_dir)
					os.cp(src, path.join(dst_dir, m.name_translations))
				else
					print("warning: missing " .. src)
				end
			end

			if m.gizmo_translations then
				for _, type_id in ipairs({ "xmp-gearupdated", "xmp-pushupdated" }) do
					local src = path.join(addon_dir, "gizmos", type_id, "translations", "_COG.json")
					if os.isfile(src) then
						local dst_dir = path.join(deploy_root, "SKSE", "Plugins", "COG", "gizmos", type_id, "translations")
						os.mkdir(dst_dir)
						os.cp(src, path.join(dst_dir, "_COG.json"))
					end
				end
			end

			local readme = path.join(addon_dir, "README.md")
			if os.isfile(readme) then
				os.cp(readme, path.join(deploy_root, "README.md"))
			end

			print("Deployed " .. m.stage .. " to " .. deploy_root)
		end

		-- Remove retired monolithic stage if present.
		local legacy_stage = path.join(os.projectdir(), "_stage", "COG - Example API")
		if os.isdir(legacy_stage) then
			os.rmdir(legacy_stage)
			print("Removed legacy stage: COG - Example API")
		end
	end)
