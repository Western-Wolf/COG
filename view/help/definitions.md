+++ Gadget #cog-help-def-gadget

A Gadget is any editable display element. The name sits near "widget", and this mod is a spiritual successor to projects like iWant Widgets, so a similar word felt appropriate.

A Gadget can be a Group, Gauge, or Gizmo.

Most Gadgets are made of Gears — individual trackers registered with COG by a mod.
 +++

+++ Gear #cog-help-def-gear

A Gear is one registered tracker: a `sourceMod` + `varName` pair, its live value, and the appearance you set in the Gears tab (icon, colours, hide rules, display name).

Exposure of a Gear is done with Groups and Gauges. By default, mod-added Gears will be added to the Default Group on their first load to make them visible, but you can change which group they're in or even remove them entirely if you prefer.
 +++

+++ Group #cog-help-def-group

A Group is a type of Gadget that exposes multiple gears in a compact, customizable line. Groups are meant to show the most information in the least space.

You can customize position, rotation, size, spacing, stack side, and shared style options (including Group colours for theming groups, and Fill from Hidden, which controls how icons display based on a Gear's `Hide when` setting).
 +++

+++ Gauge #cog-help-def-gauge

A Gauge exposes an individual Gear for tracking. Think of your Health bar in the default game: it tracks a single statistic, health. Gauges can mimic this, creating bar- or arc-style meters, or individual framed displays independent of Groups.
 +++

+++ Gizmo #cog-help-def-gizmo

Gizmos are the "fancy Gadgets", bespoke HUD elements that either don't rely on Gears or alternately rely on more than one Gear. Something like your compass, which has data sources for direction, locations, distance, etc., all packed into one.

At launch, COG ships with four Gizmos: Clock, Shout Meter, Feed, and Suppressor

- Clock: Exactly what it sounds like. COG's clock can track date, day of the week, and time. The surrounding elements can add seasons, as well as three celestial bodies: Magnus (the sun), Masser and Secunda (the moons.) The clock's seasons and moon phases are based on the vanilla game. If you've got season mods, other celestial bodies, etc., it will not see those.
- Shout Meter: COG's shout meter displays your currently-equipped shout, in Dovahzul (the dragon language). Similar to how the default compass flashes to indicate your shout cooldown, your shout will fill as you speak the words, and then slowly empty as your shout cooldown progresses.
- Feed: A multi-purpose list of what's going on. The Feed Gizmo can show you your current location on arrival, discovered locations, your notifications, inventory changes, and active magical effects.
- Suppressor: COG tries to be pretty smart out-of-box; if you add a health Gear to a group, the vanilla health bar is hidden, and the same is true for Feed elements, etc. But maybe you don't want to see certain things at all, or maybe you want to hide a HUD element that doesn't have a COG equivalent. That's where the suppressor comes in. If you know a specific HUD element's name, you can add it to Always Hide and have it hidden regardless of whether the same information is displayed in COG. Never Hide does the opposite — it keeps a named element visible even when a Gear, Gauge, Feed section, or Always Hide would otherwise soft-hide it. When hide and Never Hide conflict, Never Hide wins. The Suppressions help tab (? → Suppressions) lists live status; (winning) marks the primary controller (Suppressor > other Gizmos > Gauges > Groups).
 +++
