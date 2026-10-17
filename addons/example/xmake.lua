-- COG Example API pack (Papyrus-only reference for public COG_API surface).
local deploy_root = [[G:\Games\Skyrim\MO2 Instances\Mod - COG\mods\COG - Example API]]
local addon_dir = os.scriptdir()

target("COG_Example")
	set_kind("phony")

	on_build(function (target)
		local plugin_out = path.join(addon_dir, "plugin", "COG - Example.esp")
		os.mkdir(path.join(addon_dir, "plugin"))
		os.execv("dotnet", {
			"run",
			"--project", path.join(os.projectdir(), "tools", "MakeExampleEsp", "MakeExampleEsp.csproj"),
			"-c", "Release",
			"--",
			plugin_out
		})

		os.mkdir(deploy_root)
		os.cp(plugin_out, deploy_root)

		os.mkdir(path.join(deploy_root, "Scripts"))
		os.mkdir(path.join(deploy_root, "Source", "Scripts"))
		for _, name in ipairs({ "COG_Example", "COG_Example_Alias" }) do
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

		local view_dst = path.join(deploy_root, "PrismaUI", "views", "Example")
		os.mkdir(view_dst)
		os.cp(path.join(addon_dir, "view", "example.js"), path.join(view_dst, "example.js"))
		os.cp(path.join(addon_dir, "view", "example_push.js"), path.join(view_dst, "example_push.js"))

		-- Ship outside COG asset trees so ImportIcon demonstrates a full copy+register.
		local icon_dst = path.join(deploy_root, "Interface", "exported", "COG_Example")
		os.mkdir(icon_dst)
		os.cp(path.join(addon_dir, "assets", "example.svg"), path.join(icon_dst, "example.svg"))
		-- Drop legacy pre-seeded import from older Example deploys.
		local legacy_import = path.join(deploy_root, "PrismaUI", "views", "COG", "assets", "imports", "icons", "COG_Example")
		if os.isdir(legacy_import) then
			os.rmdir(legacy_import)
		end

		local readme = path.join(addon_dir, "README.md")
		if os.isfile(readme) then
			os.cp(readme, path.join(deploy_root, "README.md"))
		end

		print("Deployed COG_Example to " .. deploy_root)
	end)
