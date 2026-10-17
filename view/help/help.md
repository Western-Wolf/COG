### The Basics

+++ Opening the editor

Press the bound key (default **F3**) to focus the overlay editor. Press it again to close. Click the key label in the banner to rebind; press Escape or click again to cancel rebinding.
 +++

+++ General tab

Show Default Group toggles the built-in line for unassigned gears. 

Backup colours (bar, border, icon 0%/100%, neutral icon colour for counts) apply when a gear or group does not override them. Most icons use those backup icon colours when their own ends are blank; GIF and WebP icons keep their native colours instead until you set an icon end.
 +++

### Gears

+++ The Gears tab

Search registered trackers and edit appearance: display name, icon, icon colours, bar colour, and hide-when rules. Reset restores Register defaults. Adding a Gear doesn't display it. Placement still comes from Groups and Gauges.

Icon at 0% / 100% tint meter icons by value. For most types of icons, blank ends fall back to General (or group) backup colours. For GIF/WebP, blank means native file colours, allowing mod authors to ship multi-coloured, and even animated, icons in those formats.
 +++

+++ What is Suppression, and how does it work?

COG ships with the ability to suppress HUD elements, allowing you to replace them with your own COG elements. This allows us to do some neat things like hiding mod-added elements without the need to edit those mods in any way.

Gears have suppression options as a field that's registered when the gear is, but you can also edit it. Just make sure you know the exact location of the element you want to suppress (hud.stamina, for example, or hud.oxygen)
 +++

+++ Why are my count icons always the "full" colour?

Counts have no 0–100% meter. Use the neutral icon colour setting under General backup colours (or under group colours) so those icons stay calm next to progressive meters. Default is Always White; the other options use bar, border, or the icon 0% / 50% / 100% colours from that same backup (or group) set.
 +++

+++ Why isn't my mod's menu coming back after I removed the Gear from my screen?

COG can soft-hide a linked HUD target while a Gear that opts into that link is exposed on a visible Group or Gauge. Gizmos may also be programmed to hide specific elements.

Some mods, like Casting Bar, reuse one UI menu for several jobs and swap different movies into that same menu (spell, bow, shout). If COG is suppressing that menu for any of those functions, it is suppressing it for all of them. Use COG or the original mod for that whole set — mixing and matching is not possible with whole-menu hide.

To find out what's hiding a specific element, check the list at `? → Suppressions`
 +++

+++ Why doesn't Howl Cooldown ever show?

In vanilla, most werewolf howls have no voice recovery. Howl of Terror (the default) and Totem of the Hunt are both 0 seconds, so the gear stays hidden after a howl.

Only Totem of Brotherhood's pack howl has a real cooldown (60 seconds). That totem unlocks later in the Companions quests. Mods that give howls a recharge will also light the gear.
 +++

### Groups

+++ Groups tab

Create and arrange lines. Add gears, reorder them, set size/spacing/stack, and optionally use group colours. Exempt from group colours keeps a gear on its own palette when the group theme is on. Open a group accordion to raise that line above the editor for dragging.
 +++

+++ What does Fill from Hidden do?

On a group, Fill from Hidden changes how percent/timer gears with a Hide when rule appear instead of vanishing hard.

Off keeps hard hide. Alpha fades the whole gear’s opacity. Up / Down keep a greyscale icon in the layout and fill it with the current icon colour from the bottom or top (soft seam at the frontier). Alpha & Up / Alpha & Down do the same with a more transparent greyscale trough. Counts still hard-hide; inactive timers still hard-hide.

Hide when itself is set per gear on the Gears tab: Off, Below, or Above, plus a threshold from 0 to 100% (up to three decimal places).
 +++

### Gauges

+++ Gauge Types

Add Gauge creates a free-floating indicator for one gear (independent of groups). Open a gauge accordion to raise it above the editor for drag, rotate, and resize. Type is Meter (Bar or Arc) or Frame.

Meter: Show Icon and Show Label each offer none / left / right / centered / up / down. When both use the same placement, the label sits farther from the gauge than the icon (on arcs, left/right share the hollow: icon on the chosen side, label fills the remaining width). Icon Colour and Label Colour default to border colour; other options keep gear colours or match bar / label / icon / border tints. On bars, left/right label text is aligned away from the bar; arc labels wrap and scale to fit the hollow. On arcs, up is above the peak and down is below the baseline. Shape is Bar (default) or Arc. Bar and Arc share border, trough, endcaps, and fill direction — Arc is a semicircle band.

Frame: pick a Frames silhouette, fill/border colours, and Display mode Gear or Picture. Frame rotation turns the bezel only. Gear mode shows the bound gear’s icon/bar/value/title inside the plate. Picture mode shows chosen Pictures artwork only (progress from the bound gear); direction is relative to the frame, not the picture’s own rotation. Always Visible (on by default) keeps the frame shown even when the vanilla HUD is hidden or the gear’s Hide when rule would soft-hide it.
 +++

### Gizmos

+++ Tell me about Gizmos

Gizmos are custom, complicated code. They can register with COG to allow for their settings to show in the COG menu and to share COG's movement and resize functions.

The Gizmos tab opens to the gallery on the left (Cog's default Gizmos, plus any mod-registered types). Instances of Gizmos you add will show as accordions on the right, where you can alter their settings. 

Gizmos are like Gears in that they can, and sometimes do, suppress HUD elements. Unlike Gears, this is built into the Gizmo's code. It is not a setting unless the Gizmo author makes it into one. The Feed Gizmo specifically suppresses HUD elements based on the sections you enable. Turn on notifications, and your regular notification feed is gone. The COG feed entirely replaces it.
 +++

+++ What's a Suppressor? 

The Suppressor Gizmo allows you to hide HUD elements _without replacing them_, or show them _even though they've been replaced._ Use Always Hide / Never Hide for HUD soft-hide keys (see Definitions). The Suppressions help tab (? → Suppressions) lists live HUD soft-hide rules, and where those suppressions come from.

The Suppressor is editor-only. The visual element is there just to let the user know that there is a Suppressor present. It can be moved, rotated, and even expanded, but it is only a visual cue and will only appear when in the COG menu.
 +++

+++ What's with the icons in the Feed Gizmo?

Icons are on by default for each feed section, but can be turned off for any or all of them.
* Notifications have a default icon, and mod authors can send their own via the Notify API (if you allow mod icons). Disk rules under `gizmos/feed/notifications/` only apply when no API icon was set.
* Inventory, Location, Active Effects, and Skills share the same icon-rule system (see "For Mod Authors"). You'll only see each section's gizmo default icon when no rule matches.
 +++

### For Mod Authors

+++ Where are settings stored?

On disk under `Data/SKSE/Plugins/COG/`: `general.json`, `groups/`, `gears/`, `gauges/`, and `gizmos/`. The editor writes these while you play. 

Individual Gizmos may have their own folders with settings files, like the Feed Gizmo. See our docs on Nexus Mods for how you can use and customize those.
 +++

+++ What image types can I use?

COG ships with SVG images across the board, which are vector images. This is not your only choice, but vector images don't pixellate as they expand. You can make them as big as you like. Gears, Gauges, and Gizmos can also use PNG, JPEG, BMP, GIF, and WebP.

Unlike other icons, GIF and WebP do not fall back to the general colour when both icon ends are blank — they keep their native colours at those ends (and keep animating when the file is animated). This is intentional to allow you to use full-colour and animated icons if you want to.
 +++

+++ How can I make patches, changes, or Gizmos of my own?

See our docs on Nexus Mods for more complex things, like registering Gears and writing custom Gizmos, as well as details on how to control Feed rules and send custom COG notifications.
 +++
