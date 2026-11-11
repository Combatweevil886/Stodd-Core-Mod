#!/usr/bin/env python3
"""Writes the lifted sky islands and the sunken islands under bubble domes into the island world (STODD Core 3.1).

Sky islands are ordinary islands of the world's island noise that were lifted into the sky (src/main/java/stodd/core/gen/SkyField.java):
  * stodd:overworld/continents_raw   Survival Island's continentalness, untouched (what the islands are found in)
  * stodd:overworld/continents       the ground's: lifted islands pulled under the coast (stodd_core:sky mode "ground")
  * stodd:sky/*                      the same island terrain again, lifted: copies of the world's own offset / factor / jaggedness
                                     splines that read the sky island's continentalness, raised by the island's height
  * stodd:overworld/sky_islands      the sky terrain between the island's underside and the ceiling (max()'d into final_density)
  * the noise router's continents / ridges: the biomes up there are chosen with the island's own continentalness

The world files live three times in the jar (the built-in pack packs/stodd_world, the mod's own data/, and the KubeJS copy under
embedded/kubejs/data that the installer writes into the game folder); all three are written from the same dictionaries.
usage: tools/gen_sky_world.py   (run from the repository root)"""
import copy, json, os, sys

RES = 'src/main/resources'
PACK = RES + '/packs/stodd_world/data'
COPIES = [RES + '/data', RES + '/embedded/kubejs/data']
INDEX = RES + '/embedded/index.txt'
DF = 'stodd/worldgen/density_function'

NOISE = 'stodd:sky_detail'
RAW = 'stodd:overworld/continents_raw'


def sky(mode, argument=None):
    d = {'type': 'stodd_core:sky', 'mode': mode, 'raw': RAW, 'noise': NOISE}
    if argument is not None:
        d['argument'] = argument
    return d


def flat(a):
    return {'type': 'minecraft:flat_cache', 'argument': a}


def add(a, b):
    return {'type': 'minecraft:add', 'argument1': a, 'argument2': b}


def mul(a, b):
    return {'type': 'minecraft:mul', 'argument1': a, 'argument2': b}


def load(rel):
    with open(PACK + '/' + rel) as f:
        return json.load(f)


def replace_refs(node, table):
    if isinstance(node, str):
        return table.get(node, node)
    if isinstance(node, list):
        return [replace_refs(v, table) for v in node]
    if isinstance(node, dict):
        return {k: (v if k == 'type' else replace_refs(v, table)) for k, v in node.items()}
    return node


files = {}
# ---------------------------------------------------------------- continentalness: raw, ground, sky
files[DF + '/overworld/continents_raw.json'] = flat({'type': 'survivalisland:islandcont'})
files[DF + '/overworld/continents.json'] = flat(sky('ground'))
files[DF + '/sky/mask.json'] = flat(sky('mask'))
files[DF + '/sky/continents.json'] = flat(sky('continents'))
files[DF + '/sky/lift.json'] = flat(sky('lift'))
files[DF + '/sky/bottom.json'] = flat(sky('bottom'))
files[DF + '/sky/relief.json'] = sky('relief')
files[DF + '/sky/ceiling.json'] = sky('ceiling')
files[DF + '/sky/ridges.json'] = flat(sky('ridges', 'minecraft:overworld/ridges'))
# the vanilla definition of ridges_folded, over the sky's weirdness
files[DF + '/sky/ridges_folded.json'] = mul(-3.0, add(-0.3333333333333333, {'type': 'minecraft:abs', 'argument': add(-0.6666666666666666, {'type': 'minecraft:abs', 'argument': 'stodd:sky/ridges'})}))

# ---------------------------------------------------------------- the world's own terrain splines, reading the sky island
table = {'stodd:overworld/continents': 'stodd:sky/continents', 'minecraft:overworld/ridges': 'stodd:sky/ridges',
         'minecraft:overworld/ridges_folded': 'stodd:sky/ridges_folded'}
for name in ('offset', 'factor', 'jaggedness'):
    files[DF + '/sky/%s.json' % name] = replace_refs(load(DF + '/overworld/%s.json' % name), table)

# depth: the ground's formula, raised by the island's height, hills scaled by the relief (offset = -0.50375 + spline)
files[DF + '/sky/depth.json'] = add(
    {'type': 'minecraft:y_clamped_gradient', 'from_value': 1.5, 'from_y': -64, 'to_value': -1.5, 'to_y': 320},
    add('stodd:sky/lift', add(-0.50375, mul('stodd:sky/relief', add(0.50375, 'stodd:sky/offset')))))
files[DF + '/sky/sloped_cheese.json'] = add(
    mul(4.0, {'type': 'minecraft:quarter_negative', 'argument': mul(
        add('stodd:sky/depth', mul(mul('stodd:sky/jaggedness', 'stodd:sky/relief'),
                                   {'type': 'minecraft:half_negative', 'argument': {'type': 'minecraft:noise', 'noise': 'minecraft:jagged', 'xz_scale': 1500.0, 'y_scale': 0.0}})),
        'stodd:sky/factor')}),
    'minecraft:overworld/base_3d_noise')

# the sky terrain, between the underside and the ceiling, only over a sky island
above_bottom = add('stodd:overworld/y', mul(-1.0, 'stodd:sky/bottom'))
below_ceiling = add('stodd:sky/ceiling', mul(-1.0, 'stodd:overworld/y'))
solid = {'type': 'minecraft:min', 'argument1': 'stodd:sky/sloped_cheese',
         'argument2': {'type': 'minecraft:min', 'argument1': mul(0.12, above_bottom), 'argument2': mul(0.08, below_ceiling)}}
files[DF + '/overworld/sky_islands.json'] = {'type': 'minecraft:squeeze', 'argument': mul(0.64, {'type': 'minecraft:interpolated', 'argument': {
    'type': 'minecraft:range_choice', 'input': 'stodd:sky/mask', 'min_inclusive': 0.0, 'max_exclusive': 2.0,
    'when_in_range': {'type': 'minecraft:range_choice', 'input': above_bottom, 'min_inclusive': -12.0, 'max_exclusive': 1000.0,
                      'when_in_range': solid, 'when_out_of_range': -1.0},
    'when_out_of_range': -1.0}})}

# ---------------------------------------------------------------- sunken islands under bubble domes (3.1)
# Inside a dome the terrain is the sunken island only, as it would be on the ground: its own continentalness everywhere under the
# dome (the island, its beaches and the shallow sea round it), lowered so its coast is at deepIslands.coastDepth, its hills kept
# under the roof and the sea in there at most 18 blocks deep. Round the dome the sea floor is lowered to the dome's foot and rises
# back over a slope (deep/carve), so the dome stands free on the sea floor. Outside, the ground as before. Above the inner sea the
# water is drained, and the wall built, by the dome structure (CellDomePiece).
files[DF + '/deep/mask.json'] = flat(sky('deep_mask'))
files[DF + '/deep/inside.json'] = sky('dome')
files[DF + '/deep/continents.json'] = flat(sky('deep_continents'))
files[DF + '/deep/lift.json'] = flat(sky('deep_lift'))
files[DF + '/deep/relief.json'] = sky('deep_relief')
files[DF + '/deep/ceiling.json'] = flat(sky('deep_ceiling'))
files[DF + '/deep/apron.json'] = flat(sky('deep_apron'))
files[DF + '/deep/carve.json'] = flat(sky('deep_carve'))
files[DF + '/deep/climate.json'] = sky('deep_climate')
# solid at most up to the carve (+ shift): 0.1 a block, like the other caps
def carve_cap(shift):
    return mul(0.1, add('stodd:deep/carve', add(float(shift), mul(-1.0, 'stodd:overworld/y'))))
files[DF + '/overworld/ground_carved.json'] = {'type': 'minecraft:min', 'argument1': 'stodd:overworld/ground_density', 'argument2': carve_cap(0)}
dtable = {'stodd:overworld/continents': 'stodd:deep/continents', 'minecraft:overworld/ridges': 'stodd:sky/ridges',
          'minecraft:overworld/ridges_folded': 'stodd:sky/ridges_folded'}
for name in ('offset', 'factor', 'jaggedness'):
    files[DF + '/deep/%s.json' % name] = replace_refs(load(DF + '/overworld/%s.json' % name), dtable)
files[DF + '/deep/depth.json'] = add(
    {'type': 'minecraft:y_clamped_gradient', 'from_value': 1.5, 'from_y': -64, 'to_value': -1.5, 'to_y': 320},
    add('stodd:deep/lift', add(-0.50375, mul('stodd:deep/relief', add(0.50375, 'stodd:deep/offset')))))
files[DF + '/deep/sloped_cheese.json'] = add(
    mul(4.0, {'type': 'minecraft:quarter_negative', 'argument': mul(
        add('stodd:deep/depth', mul(mul('stodd:deep/jaggedness', 'stodd:deep/relief'),
                                    {'type': 'minecraft:half_negative', 'argument': {'type': 'minecraft:noise', 'noise': 'minecraft:jagged', 'xz_scale': 1500.0, 'y_scale': 0.0}})),
        'stodd:deep/factor')}),
    'minecraft:overworld/base_3d_noise')
under_roof = add('stodd:deep/ceiling', mul(-1.0, 'stodd:overworld/y'))
floor = add('stodd:deep/apron', mul(-1.0, 'stodd:overworld/y'))
files[DF + '/overworld/deep_islands.json'] = {'type': 'minecraft:squeeze', 'argument': mul(0.64, {'type': 'minecraft:interpolated', 'argument': {
    'type': 'minecraft:range_choice', 'input': 'stodd:deep/mask', 'min_inclusive': 0.0, 'max_exclusive': 2.0,
    'when_in_range': {'type': 'minecraft:max',
                      'argument1': {'type': 'minecraft:min', 'argument1': 'stodd:deep/sloped_cheese', 'argument2': mul(0.1, under_roof)},
                      'argument2': mul(0.2, floor)},
    'when_out_of_range': -1.0}})}

# ---------------------------------------------------------------- the router: biomes see the sky island up there
ns = load('minecraft/worldgen/noise_settings/overworld.json')
# final density: max(<inside a dome: the sunken island | elsewhere: the ground>, the sky islands)
fd = ns['noise_router']['final_density']
assert fd['type'] == 'minecraft:max' and fd['argument2'] == 'stodd:overworld/sky_islands', 'unexpected final_density'
ground = fd['argument1']
if isinstance(ground, dict) and ground.get('type') == 'minecraft:range_choice' and ground.get('input') == 'stodd:deep/mask':
    ground = ground['when_out_of_range']
if ground in ('stodd:overworld/ground_density', 'stodd:overworld/ground_carved'):
    ground = load(DF + '/overworld/ground_density.json')
# the ground's own density (the world's terrain as before), named so it is written once and used twice
files[DF + '/overworld/ground_density.json'] = ground
ground = 'stodd:overworld/ground_carved'
fd['argument1'] = {'type': 'minecraft:range_choice', 'input': 'stodd:deep/mask', 'min_inclusive': 0.0, 'max_exclusive': 2.0,
                   'when_in_range': {'type': 'minecraft:range_choice', 'input': 'stodd:deep/inside', 'min_inclusive': -1000000.0, 'max_exclusive': 1.0,
                                     'when_in_range': 'stodd:overworld/deep_islands', 'when_out_of_range': ground},
                   'when_out_of_range': ground}
# the surface the aquifers and the surface rules go by: lowered with the sea floor (9 blocks deeper, so the sea inside a dome
# and in the hollow round it is the open sea, one water level, and its floor still gets sand and gravel)
init = ns['noise_router']['initial_density_without_jaggedness']
if isinstance(init, dict) and init.get('type') == 'minecraft:min' and init.get('argument2') == carve_cap(-9):
    init = init['argument1']
ns['noise_router']['initial_density_without_jaggedness'] = {'type': 'minecraft:min', 'argument1': init, 'argument2': carve_cap(-9)}
# the depth the biomes are chosen with: inside a dome the sunken island's own (no cave biomes in its open air); round it, the
# lowered sea floor's
depth = ns['noise_router']['depth']
if isinstance(depth, dict) and depth.get('input') == 'stodd:deep/climate':
    depth = depth['when_out_of_range']['argument1']
ns['noise_router']['depth'] = {'type': 'minecraft:range_choice', 'input': 'stodd:deep/climate', 'min_inclusive': 0.0, 'max_exclusive': 2.0,
                               'when_in_range': 'stodd:deep/depth',
                               'when_out_of_range': {'type': 'minecraft:min', 'argument1': depth,
                                                     'argument2': mul(0.0078125, add('stodd:deep/carve', mul(-1.0, 'stodd:overworld/y')))}}
ns['noise_router']['continents'] = sky('climate_continents', 'stodd:overworld/continents')
ns['noise_router']['ridges'] = sky('climate_ridges', 'minecraft:overworld/ridges')
files['minecraft/worldgen/noise_settings/overworld.json'] = ns

removed = [DF + '/overworld/sky_mask.json']


def write(root, rel, data):
    path = root + '/' + rel
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as f:
        json.dump(data, f, indent=2)
        f.write('\n')


for root in [PACK] + COPIES:
    for rel, data in files.items():
        write(root, rel, data)
    for rel in removed:
        if os.path.exists(root + '/' + rel):
            os.remove(root + '/' + rel)

# the installer's index: every world file of the KubeJS copy is a script ("S": always kept in step with the jar)
lines = [l for l in open(INDEX).read().split('\n') if l]
gone = set('S\tkubejs/data/' + r for r in removed)
lines = [l for l in lines if l not in gone]
want = set('S\tkubejs/data/' + r for r in files)
new = sorted(want - set(lines))
first = min(i for i, l in enumerate(lines) if l.startswith('S\tkubejs/data/'))
block = sorted(set(l for l in lines if l.startswith('S\tkubejs/data/')) | want)
lines = lines[:first] + block + [l for l in lines[first:] if not l.startswith('S\tkubejs/data/')]
open(INDEX, 'w').write('\n'.join(lines) + '\n')
print('sky world: %d files written in %d places, %d new index lines' % (len(files), 1 + len(COPIES), len(new)))
