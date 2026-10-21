#!/usr/bin/env python3
"""Seed name: catalog entries (not harvested). Run from _cog: python tools/seed_name_translations.py"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "plugin" / "translations" / "_COG.json"

# English key -> fr-CA (en-CA value equals the key)
ENTRIES: dict[str, str] = {
	"Default Group": "Groupe par défaut",
	"Stat": "Stat",
	"Mount": "Monture",
	"Equipment": "Équipement",
	"Werewolf": "Loup-garou",
	"Vampire": "Vampire",
	"Survival": "Survie",
	"Charge": "Charge",
	"Resistance": "Résistance",
	"iWant Integration": "Intégration iWant",
	"Example": "Exemple",
	"Clock": "Horloge",
	"Shout Meter": "Compteur de cri",
	"Feed": "Fil",
	"Suppressor": "Suppresseur",
	"Example (Gear Updated)": "Exemple (engrenage mis à jour)",
	"Example (Push Updated)": "Exemple (poussée mise à jour)",
	"Health": "Santé",
	# Official French Skyrim actor values: Santé / Magie / Vigueur (not Endurance).
	"Stamina": "Vigueur",
	"Mount Stamina": "Vigueur de monture",
	"Magicka": "Magie",
	"Carry Weight": "Capacité de charge",
	"Arrows (Equipped)": "Flèches (équipées)",
	"Bolts (Equipped)": "Carreaux (équipés)",
	"Transformation": "Transformation",
	"Vampiric Hunger": "Faim vampirique",
	"Oxygen": "Oxygène",
	"Bow Draw": "Visée à l'arc",
	"Spell Casting": "Lancement de sort",
	"Weapon Charge": "Charge d'arme",
	"Secondary Weapon Charge": "Charge d'arme secondaire",
	"Shout Cooldown": "Recharge de cri",
	"Howl Cooldown": "Recharge de hurlement",
	"Fire Resistance": "Résistance au feu",
	"Frost Resistance": "Résistance au gel",
	"Shock Resistance": "Résistance à la foudre",
	"Poison Resistance": "Résistance au poison",
	"Magic Resistance": "Résistance à la magie",
	"Disease Resistance": "Résistance aux maladies",
	"Septims": "Septims",
	"Stones of Barenziah": "Pierres de Barenziah",
	"Group {num}": "Groupe {num}",
	"Gauge {num}": "Jauge {num}",
	"Clock {num}": "Horloge {num}",
	"Feed {num}": "Fil {num}",
	"Shout Meter {num}": "Compteur de cri {num}",
	"Suppressor {num}": "Suppresseur {num}",
	"Example (Gear Updated) {num}": "Exemple (engrenage mis à jour) {num}",
	"Example (Push Updated) {num}": "Exemple (poussée mise à jour) {num}",
}


UI_CHROME = {
	"cog-push-stock-titles": {
		"en-CA": "Update stock titles on translation",
		"fr-CA": "Mettre à jour les titres par défaut à la traduction",
	},
	"cog-push-stock-titles-tip": {
		"en-CA": "When changing language, rewrite gears, groups, gauges, and gizmos that still use the default name.",
		"fr-CA": "Lors d’un changement de langue, réécrire les engrenages, groupes, jauges et gadgets qui portent encore le nom par défaut.",
	},
}


def main() -> None:
	data = json.loads(OUT.read_text(encoding="utf-8"))
	for en, fr in ENTRIES.items():
		tag = f"name:{en}"
		data[tag] = {"en-CA": en, "fr-CA": fr}
	for tag, langs in UI_CHROME.items():
		data[tag] = langs
	OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
	print(f"Seeded {len(ENTRIES)} name: tags + {len(UI_CHROME)} chrome into {OUT} (total {len(data)})")


if __name__ == "__main__":
	main()
