"""Generates the data of STODD Chrome (the Project: Edgerunner addon) from one table: the implant items, their models and names,
their assembly recipes, the Ripperdoc slot tags and the KubeJS script that registers them and runs their effects.
   python3 tools/gen_chrome.py      (the icons and logos: tools/gen_chrome_art.py)"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, 'chrome/src/main/resources')
NS = 'stodd_chrome'
PE = 'project_edgerunner'
def _version():
    for line in open(os.path.join(ROOT, 'gradle.properties')):
        if line.startswith('chrome_version='): return line.split('=', 1)[1].strip()
    return '1.0.0'
VERSION = _version()

AS, SPD, DMG, ARM, TGH, KB, HP, LUCK = ('minecraft:generic.attack_speed', 'minecraft:generic.movement_speed', 'minecraft:generic.attack_damage',
    'minecraft:generic.armor', 'minecraft:generic.armor_toughness', 'minecraft:generic.knockback_resistance', 'minecraft:generic.max_health',
    'minecraft:generic.luck')
REACH, BREACH, STEP = 'forge:entity_reach', 'forge:block_reach', 'forge:step_height_addition'
ADD, BASE, TOTAL = 0, 1, 2   # attribute operations: add, multiply base, multiply total

# id: name, tier, body slot, load, what it does (attribute modifiers, healing, damage immunity, special), recipe, blurb
IMPLANTS = [
    # ------------------------------------------------------------------ midgame (tier 3)
    dict(id='synaptic_accelerator', name='Synaptic Accelerator', tier=3, slot='nervous_system', load=24,
         attrs=[(AS, 0.10, BASE), (SPD, 0.05, BASE)],
         blurb='Rewired motor nerves: +10% attack speed, +5% speed.',
         recipe=[(PE + ':temporal_regulator_t2', 1), (PE + ':phase_stabilizer_t3', 1), ('palladium:quartz_circuit', 2), ('minecraft:gold_ingot', 4)]),
    dict(id='subdermal_plating', name='Subdermal Plating', tier=3, slot='integumentary_system', load=22,
         attrs=[(ARM, 4, ADD), (TGH, 2, ADD)],
         blurb='Titanium plates under the skin: +4 armor, +2 armor toughness.',
         recipe=[(PE + ':scarab_shell_plate_t2', 1), (PE + ':kinetic_damper_frame_t3', 1), ('palladium:titanium_ingot', 6), ('minecraft:diamond', 2)]),
    dict(id='grip_servos', name='Grip Servos', tier=3, slot='hands', load=18,
         attrs=[(DMG, 2, ADD), (BREACH, 1, ADD)],
         blurb='Servo-driven fingers: +2 attack damage, +1 block reach.',
         recipe=[(PE + ':kinetic_actuator_t1', 2), (PE + ':myofiber_bundle_t2', 1), ('palladium:lead_circuit', 2), ('minecraft:iron_ingot', 6)]),
    dict(id='adrenal_pump', name='Adrenal Pump', tier=3, slot='circulatory_system', load=26,
         attrs=[(HP, 4, ADD)], heal=(100, 1.0),
         blurb='Synthetic adrenal gland: +2 hearts, heals half a heart every 5 s.',
         recipe=[(PE + ':hemo_chamber_t2', 1), (PE + ':bio_monitor_t2', 1), ('palladium:heart_shaped_herb', 1), ('minecraft:glistering_melon_slice', 4)]),
    dict(id='lynx_tendons', name='Lynx Tendons', tier=3, slot='legs', load=20,
         attrs=[(SPD, 0.10, BASE), (STEP, 0.5, ADD)],
         blurb='Spring-steel tendons: +10% speed, step up full blocks.',
         recipe=[(PE + ':spring_recoil_array_t3', 1), (PE + ':joint_servo_t1', 2), ('minecraft:rabbit_foot', 2), ('palladium:titanium_ingot', 4)]),
    # ------------------------------------------------------------------ endgame (tier 5)
    dict(id='kerenzikov_reflex_core', name='Kerenzikov Reflex Core', tier=5, slot='nervous_system', load=75,
         attrs=[(AS, 0.30, BASE), (SPD, 0.12, BASE)], special='dodge',
         blurb='Military reflex booster: +30% attack speed, +12% speed, and a 20% chance to slip any attack (once every 3 s).',
         recipe=[(PE + ':latency_shunt_t4', 1), (PE + ':quantum_sync_lattice_t5', 1), (PE + ':neural_matrix_t4', 1),
                 ('palladium:vibranium_circuit', 4), ('minecraft:nether_star', 1), ('minecraft:echo_shard', 4)]),
    dict(id='titan_dermal_weave', name='Titan Dermal Weave', tier=5, slot='integumentary_system', load=85,
         attrs=[(ARM, 8, ADD), (TGH, 6, ADD), (KB, 0.4, ADD)], immune=['minecraft:is_explosion'],
         blurb='Vibranium mesh skin: +8 armor, +6 toughness, 40% knockback resistance, blast-proof.',
         recipe=[(PE + ':iconic_skeletal_chassis_t5', 1), (PE + ':ballistic_spine_plate_t3', 2), ('palladium:vibranium_ingot', 6),
                 ('minecraft:netherite_ingot', 2), ('minecraft:nether_star', 1)]),
    dict(id='monowire_grips', name='Monowire Grips', tier=5, slot='hands', load=80,
         attrs=[(DMG, 6, ADD), (DMG, 0.15, TOTAL), (REACH, 1, ADD)],
         blurb='Monomolecular wire in the fingertips: +6 attack damage, +15% damage, +1 attack reach.',
         recipe=[(PE + ':arms_actuator_matrix_t4', 1), (PE + ':arms_power_core_t4', 1), (PE + ':apogee_overdrive_kernel_t5', 1),
                 ('palladium:vibranium_flux_capacitor', 2), ('minecraft:netherite_ingot', 2), ('minecraft:echo_shard', 2)]),
    dict(id='second_heart', name='Second Heart', tier=5, slot='circulatory_system', load=95,
         attrs=[(HP, 12, ADD)], heal=(40, 1.0), special='second_heart',
         blurb='A backup heart: +6 hearts, heals half a heart every 2 s, and once every 3 minutes a killing blow leaves you standing.',
         recipe=[(PE + ':regen_nanite_scaffold_t5', 2), (PE + ':trauma_booster_module_t4', 1), ('palladium:vibranium_circuit', 2),
                 ('minecraft:totem_of_undying', 2), ('minecraft:nether_star', 1)]),
    dict(id='overclocked_neocortex', name='Overclocked Neocortex', tier=5, slot='frontal_cortex', load=90,
         attrs=[(DMG, 0.20, TOTAL), (LUCK, 2, ADD), (REACH, 1.5, ADD), (BREACH, 1.5, ADD)],
         blurb='Combat co-processor: +20% damage, +2 luck, +1.5 reach.',
         recipe=[(PE + ':os_core_t5', 1), (PE + ':neural_matrix_t4', 2), (PE + ':quantum_sync_lattice_t5', 1), (PE + ':optic_fusion_controller_t4', 1),
                 ('minecraft:dragon_breath', 4), ('minecraft:nether_star', 1)]),
    dict(id='apex_sprint_actuators', name='Apex Sprint Actuators', tier=5, slot='legs', load=70,
         attrs=[(SPD, 0.25, BASE), (STEP, 1.0, ADD)], immune=['minecraft:is_fall'],
         blurb='Racing-grade leg actuators: +25% speed, step up two blocks, no fall damage.',
         recipe=[(PE + ':falcon_overclocker_t4', 1), (PE + ':cooldown_optimizer_t4', 1), (PE + ':iconic_skeletal_chassis_t5', 1),
                 ('palladium:vibranium_ingot', 4), ('minecraft:netherite_ingot', 1), ('minecraft:phantom_membrane', 4)]),
]

SLOT_NAMES = {'nervous_system': 'Nervous System', 'integumentary_system': 'Skin', 'hands': 'Hands', 'circulatory_system': 'Circulatory System',
              'legs': 'Legs', 'frontal_cortex': 'Frontal Cortex'}


def write(rel, obj):
    p = os.path.join(RES, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w') as f:
        if isinstance(obj, str): f.write(obj)
        else: json.dump(obj, f, indent=2); f.write('\n')


def uuid_for(i, k):
    return 'c4120000-%04x-4000-8000-%012x' % (i, k)


def main():
    lang = {}
    tags = {}
    for i, im in enumerate(IMPLANTS):
        iid = NS + ':' + im['id']
        end = im['tier'] >= 5
        write('addon/%s/items/%s.json' % (NS, im['id']), {
            'type': 'palladium:default', 'max_stack_size': 1, 'rarity': 'epic' if end else 'rare',
            'creative_mode_tab': PE + ':cyberpunk',
            'tooltip': [
                {'text': '%s (%s)' % ('Endgame implant' if end else 'Midgame implant', SLOT_NAMES[im['slot']]), 'color': '#AAAAAA'},
                {'text': 'Tier: %d | Load: %d' % (im['tier'], im['load']), 'color': '#BF40BF'},
                {'text': im['blurb'], 'color': '#66CCFF'},
                {'text': 'STODD Chrome', 'color': '#555555'}]})
        write('assets/%s/models/item/%s.json' % (NS, im['id']), {'parent': 'minecraft:item/generated', 'textures': {'layer0': '%s:item/%s' % (NS, im['id'])}})
        lang['item.%s.%s' % (NS, im['id'])] = im['name']
        lang['tailoring.%s.%s' % (NS, im['id'])] = im['name'] + ' Assembly'
        write('data/%s/recipes/%s_tailoring.json' % (NS, im['id']), {
            'type': 'palladium:item_tailoring',
            'title': {'translate': 'tailoring.%s.%s' % (NS, im['id'])},
            'tool': {'item': PE + ':soldering_iron'},
            'tool_icon': PE + ':item/soldering_iron_tool_icon_bw',
            'category': PE + ':cyberware_tailoring',
            'requires_unlocking': False,
            'ingredients': [{'ingredient': {'item': it}, 'count': n} for it, n in im['recipe']],
            'results': {'chest': iid}})
        tags.setdefault(im['slot'], []).append(iid)
        # the implant's power, built by the script (so the config can scale it)
        abilities = []
        for k, (attr, amount, op) in enumerate(im.get('attrs', [])):
            abilities.append({'type': 'palladium:attribute_modifier', 'attribute': attr, 'amount': amount, 'operation': op, 'uuid': uuid_for(i, k)})
        if 'heal' in im:
            abilities.append({'type': 'palladium:healing', 'frequency': im['heal'][0], 'amount': im['heal'][1]})
        if 'immune' in im:
            abilities.append({'type': 'palladium:damage_immunity', 'damage_sources': im['immune']})
        im['abilities'] = abilities
    lang['stodd_chrome.reflex'] = 'Kerenzikov: dodged!'
    lang['stodd_chrome.second_heart'] = 'Second Heart: you should be dead.'
    write('assets/%s/lang/en_us.json' % NS, dict(sorted(lang.items())))
    for slot, ids in tags.items():
        write('data/%s/tags/items/cyberware/%s.json' % (PE, slot), {'replace': False, 'values': ids})
    table = [{k: im[k] for k in ('id', 'name', 'tier', 'slot', 'load', 'blurb', 'abilities')} | ({'special': im['special']} if 'special' in im else {})
             for im in IMPLANTS]
    with open(os.path.join(ROOT, 'chrome/script_template.js')) as f:
        script = f.read().replace('/*@IMPLANTS@*/[]', json.dumps(table, indent=2)).replace('@VERSION@', VERSION)
    write('data/%s/kubejs_scripts/stodd_chrome.js' % NS, script)
    write('pack.mcmeta', {'pack': {'pack_format': 15, 'description': 'STODD Chrome: endgame and midgame implants for Project: Edgerunner'}})
    write('META-INF/mods.toml', MODS_TOML.replace('@VERSION@', VERSION))
    print('STODD Chrome %s: %d implants, %d slot tags' % (VERSION, len(IMPLANTS), len(tags)))


MODS_TOML = '''modLoader="javafml"
loaderVersion="[47,)"
license="All Rights Reserved"
issueTrackerURL="https://github.com/Combatweevil886/Stodd-Core-Mod/issues"

[[mods]]
modId="stodd_chrome"
version="@VERSION@"
displayName="STODD Chrome"
logoFile="logo.png"
authors="STODD"
description=\'\'\'An addon for Project: Edgerunner: eleven more implants for the Ripperdoc, so a Cyberware User keeps up with the
strongest origins. Five midgame implants (tier 3) and six endgame implants (tier 5), assembled at the tailoring bench with the
soldering iron from Edgerunner's own components, Palladium circuits and the rarest vanilla materials. Settings: config/stodd/chrome.json.\'\'\'

[[dependencies.stodd_chrome]]
modId="forge"
mandatory=true
versionRange="[47,)"
ordering="NONE"
side="BOTH"

[[dependencies.stodd_chrome]]
modId="minecraft"
mandatory=true
versionRange="[1.20.1]"
ordering="NONE"
side="BOTH"

[[dependencies.stodd_chrome]]
modId="project_edgerunner"
mandatory=true
versionRange="[1.1.2,)"
ordering="AFTER"
side="BOTH"

[[dependencies.stodd_chrome]]
modId="palladium"
mandatory=true
versionRange="[4.4.0,)"
ordering="AFTER"
side="BOTH"

[[dependencies.stodd_chrome]]
modId="kubejs"
mandatory=true
versionRange="[2001.6,)"
ordering="AFTER"
side="BOTH"
'''

if __name__ == '__main__':
    main()
