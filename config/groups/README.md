# groups/

`default.json` here is a **reference template** only (matches `CogRegistryJson::DefaultGroup()`).

Deploy does **not** copy it into the mod. On first load, COG inserts the Default Group in memory and `SaveConfig` writes `groups/default.json` under `Data/SKSE/Plugins/COG/` (MO2 Overwrite), so reinstalling the mod no longer wipes the group.
