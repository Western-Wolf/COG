ScriptName COG_Feed_API Hidden
{Public Papyrus API for the COG Feed. Receipts last for the SKSE session only (expire after the line finishes fading).

Listen for ModEvent COG_Feed_Ready (not COG_Ready) before BeginRegister / RegisterSource / EndRegister.
Batch required: RegisterSource outside an open BeginRegister returns 0.
EndRegister trims catalog entries for that sourceMod that were not re-registered; placed Feed
settings.sources.<id> are kept so values survive mod absence.}

; True after Feed storage ensure + 1.11→1.2 folder migrate + builtin source batch.
Bool Function IsFeedReady() Global Native

; Open a registration batch for this mod (required for RegisterSource).
Function BeginRegister(String sourceMod, String pluginFile = "") Global Native

; Register a Feed source module. settingsHtmlPath is Data-relative (copied into
; gizmoTypes/cog-feed/sources/<sourceId>.html unless already that dest).
; colourVarsJson / hudSuppressJson: JSON string arrays. hudSuppressJson = flat alias list only.
; Returns session receipt (0 = no open batch / invalid id).
Int Function RegisterSource(String sourceMod, String sourceId, String displayName, String settingsHtmlPath = "", String colourVarsJson = "[]", String hudSuppressJson = "[]") Global Native

; Commit batch and prune catalog entries for sourceMod that were not registered this batch.
Function EndRegister(String sourceMod) Global Native

; Relative path gizmoTypes/cog-feed/sources/<sourceId> (creates folder). Rules/packs only — not settings HTML.
String Function SourceStorage(String sourceId) Global Native

; Push a line into a play-visible Feed.
; asColor: #RRGGBB / #RGB, or sourceId.varName (e.g. cog-inventory.addColor). Each Feed resolves
;   against its own settings; unknown → General border colour.
; asSource: optional. Omit or "" → Notifications module when enabled; logged as "empty".
;   Registered id → that source when enabled. Unknown string → Notifications; log as provided.
;   Builtins: cog-notifications, cog-inventory, cog-location, cog-skills, cog-effects
;   (legacy cog-feednotifications etc. accepted as aliases). Mods: own id, never the cog- prefix.
; afCurrent / afMax: omit both (< 0) for a normal toast. Both set → meter bar (asType "timer" or progress).
;   Only current set → that number is appended to the message (still a toast, no bar).
; aiReceipt: 0 = new line. Non-zero upserts if still visible; expired/unknown → new line + new receipt.
; Returns session receipt (0 = dropped / no matching Feed section).
Int Function Notify(String asMessage, String asColor = "#FFFFFF", String asIcon = "", String asSource = "", Float afCurrent = -1.0, Float afMax = -1.0, String asType = "", Int aiReceipt = 0) Global Native

; Fade/remove a line by receipt (e.g. Active Effects when a timer ends).
Function Dismiss(Int aiReceipt) Global Native
