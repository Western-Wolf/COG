-- COG iWant compatibility pack (stub Widgets + Status Bars bridge + icon import DLL).
-- Stages under repo `_stage/`; release.ps1 builds the FOMOD zip from there (no MO2 mod folder).
local deploy_root = path.join(os.projectdir(), "_stage", "COG - iWant Integration")
local addon_dir = os.scriptdir()

target("COG_iWant")
	add_deps("commonlibsse-ng")

	add_rules("commonlibsse-ng.plugin", {
		name = "COG_iWant",
		author = "WesternWolff",
		description = "COG iWant Widgets / Status Bars compatibility bridge"
	})

	add_files("src/**.cpp")
	add_headerfiles("src/**.h")
	add_includedirs("src")
	set_pcxxheader("src/pch.h")
	before_build(function (target)
		os.execv("dotnet", {
			"run",
			"--project", path.join(os.projectdir(), "tools", "MakeIWantStubs", "MakeIWantStubs.csproj"),
			"-c", "Release",
			"--",
			path.join(addon_dir, "plugin")
		})
	end)

	after_build(function (target)
		local plugin_dir = path.join(deploy_root, "SKSE", "Plugins")
		os.mkdir(plugin_dir)
		os.cp(target:targetfile(), plugin_dir)
		local pdb = path.join(path.directory(target:targetfile()), path.basename(target:targetfile()) .. ".pdb")
		if os.isfile(pdb) then
			os.cp(pdb, plugin_dir)
		end

		os.mkdir(path.join(deploy_root, "Scripts"))
		os.mkdir(path.join(deploy_root, "Source", "Scripts"))
		for _, name in ipairs({
			"iWant_Widgets",
			"iWant_Status_Bars",
			"iwant_status_bars_alias",
			"COG_iWant",
		}) do
			local psc = path.join(addon_dir, "papyrus", name .. ".psc")
			if os.isfile(psc) then
				os.cp(psc, path.join(deploy_root, "Source", "Scripts"))
			end
			local pex = path.join(addon_dir, "papyrus", "pex", name .. ".pex")
			if os.isfile(pex) then
				os.cp(pex, path.join(deploy_root, "Scripts"))
			end
		end

		local stub_dir = path.join(addon_dir, "plugin")
		if os.isdir(stub_dir) then
			for _, file in ipairs(os.files(path.join(stub_dir, "*"))) do
				os.cp(file, deploy_root)
			end
		end

		local readme = path.join(addon_dir, "README.md")
		if os.isfile(readme) then
			os.cp(readme, path.join(deploy_root, "README.md"))
		end

		print("Deployed COG_iWant to " .. deploy_root)
	end)
