ScriptName COG_Feed_API Hidden
{Public Papyrus API for the COG Feed. Receipts last for the SKSE session only (expire after the line finishes fading).}

; Push a line into a play-visible Feed.
; asColor: #RRGGBB / #RGB, or a Feed colour-var name registered by a section on that Feed
;   (e.g. skillProgressColor, addColor, effectsColor, textColor). Each Feed resolves the
;   name to its own settings hex before paint; unknown names → General border colour.
; asSource: optional. Omit or "" is logged as "general" (no source given). COG builtins use cog-feed*
;   (cog-feednotifications, cog-feedinventory, cog-feedlocation, cog-feedskills, cog-feedeffects).
;   Mods: own id, never the cog- prefix.
; afCurrent / afMax: omit both (< 0) for a normal toast. Both set → meter bar (asType "timer" or progress).
;   Only current set → that number is appended to the message (still a toast, no bar).
; aiReceipt: 0 = new line. Non-zero upserts if still visible; expired/unknown → new line + new receipt.
; Returns session receipt (0 = dropped / no matching Feed section).
Int Function Notify(String asMessage, String asColor = "#FFFFFF", String asIcon = "", String asSource = "", Float afCurrent = -1.0, Float afMax = -1.0, String asType = "", Int aiReceipt = 0) Global Native

; Fade/remove a line by receipt (e.g. Active Effects when a timer ends).
Function Dismiss(Int aiReceipt) Global Native
