#!/usr/bin/env python3
"""Checks the assembled STODD Core 3 resources (mod/src/main/resources) before the build: every JSON parses, the new worldgen
files reference the types the Java code registers, every template the world rules can pick exists (with the size the rules
assume), the Log Pose model and recipe are complete, the world pack is identical to the jar's data, the embedded index matches,
and the version is the same everywhere.  usage: verify_mod.py <mod dir>"""
import gzip, io, json, os, re, struct, sys

M = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/mod'
R = M + '/src/main/resources'
J = M + '/src/main/java'
errs, checks = [], [0]


def ok(c, msg):
    checks[0] += 1
    if not c: errs.append(msg)


def jload(p):
    return json.load(open(p, encoding='utf-8'))


# 1. JSON
n = 0
for root, _, files in os.walk(R):
    for f in files:
        if f.endswith(('.json', '.mcmeta')):
            p = os.path.join(root, f)
            try: jload(p); n += 1
            except Exception as e: errs.append('bad JSON %s: %s' % (p, e))
print('JSON files parsed:', n)

# 2. registered ids (from the Java source) vs data
src = ''.join(open(os.path.join(r, f)).read() for r, _, fs in os.walk(J) for f in fs if f.endswith('.java'))
reg = set(re.findall(r'(?:STRUCTURE_TYPES|PLACEMENTS|ITEMS)\.register\("([a-z_]+)"', src)) | set(re.findall(r'piece\("([a-z_]+)"', src))
mod_id = re.search(r'MOD_ID = "([a-z_]+)"', src).group(1)
ok(mod_id == 'stodd_core', 'mod id')
for name in ('city_block', 'isle_block', 'cell_grid', 'log_pose', 'cell_ground', 'cell_template', 'cell_features'):
    ok(name in reg, 'the Java code registers %s' % name)
S = R + '/data/stodd/worldgen'
for st, typ in (('city_block', 'stodd_core:city_block'), ('isle_block', 'stodd_core:isle_block'), ('sky_block', 'stodd_core:isle_block')):
    d = jload('%s/structure/%s.json' % (S, st))
    ok(d['type'] == typ, '%s has type %s' % (st, typ))
    ok(d['biomes'] == '#stodd:has_structure/cells' and d['terrain_adaptation'] == 'none', '%s biomes / adaptation' % st)
    ok(d['step'] in ('top_layer_modification',), '%s step' % st)
ok(jload(S + '/structure/sky_block.json').get('kind') == 'sky' and jload(S + '/structure/isle_block.json').get('kind') == 'ground', 'isle kinds')
for ss in ('city_blocks', 'isle_blocks', 'sky_blocks'):
    d = jload('%s/structure_set/%s.json' % (S, ss))
    ok(d['placement']['type'] == 'stodd_core:cell_grid' and d['placement']['cell_chunks'] == 3, '%s placement' % ss)
    for e in d['structures']: ok(os.path.exists('%s/structure/%s.json' % (S, e['structure'].split(':')[1])), '%s -> %s exists' % (ss, e['structure']))
tag = jload(R + '/data/stodd/tags/worldgen/biome/has_structure/cells.json')
ok('#minecraft:is_overworld' in tag['values'], 'cells may start in every overworld biome')
for v in tag['values']:
    if isinstance(v, dict) and v['id'].startswith('stodd:'): ok(os.path.exists('%s/biome/%s.json' % (S, v['id'][6:])), 'biome %s exists' % v['id'])

# 3. templates the rules can pick
rules = jload(R + '/stodd_world.json')


def nbt_size(p):
    raw = gzip.open(p).read()
    # find the "size" list of 3 ints: TAG_List(9) name "size" type TAG_Int(3) length 3
    i = raw.find(b'\x09\x00\x04size\x03\x00\x00\x00\x03')
    if i < 0: return None
    return struct.unpack('>iii', raw[i + 12:i + 24])


bad = 0
cities = 0
for sid, st in rules['city']['styles'].items():
    for t in [x['id'] for x in st['templates']] + st['plazas']:
        p = '%s/data/stodd/structures/city/%s.nbt' % (R, t)
        if not os.path.exists(p): errs.append('city template missing: ' + t); bad += 1; continue
        sz = nbt_size(p)
        ok(sz is not None and sz[0] == 48 and sz[2] == 48, 'city template %s is 48 x 48 (%s)' % (t, sz))
        cities += 1
for lid, lm in rules['makeover']['landmarks'].items():
    p = '%s/data/stodd/structures/isle/%s.nbt' % (R, lid)
    if not os.path.exists(p): errs.append('landmark missing: ' + lid); continue
    sz = nbt_size(p)
    ok(sz is not None and list(sz) == lm['size'], 'landmark %s size %s = rules %s' % (lid, sz, lm['size']))
for tid, th in rules['makeover']['themes'].items():
    for i in th['center'] + [s['id'] for s in th['scatter']]: ok(i in rules['makeover']['landmarks'], '%s uses known landmark %s' % (tid, i))
for s in rules['makeover']['sky']['scatter']: ok(s['id'] in rules['makeover']['landmarks'], 'sky landmark %s known' % s['id'])
print('templates checked: %d city blocks, %d landmarks' % (cities, len(rules['makeover']['landmarks'])))
ok(rules['version'] == 3 and len(rules['origins']['list']) == 10, 'rules version / origins')

# 4. the Log Pose
lp = jload(R + '/assets/stodd_core/models/item/log_pose.json')
ok(len(lp['overrides']) == 33, 'Log Pose: 33 needle overrides')
ok(all(list(o['predicate'].keys()) == ['stodd_core:angle'] for o in lp['overrides']), 'Log Pose predicate is stodd_core:angle (matches LogPoseClient)')
ok('new ResourceLocation(StoddCore.MOD_ID, "angle")' in src, 'LogPoseClient registers stodd_core:angle')
angles = [o['predicate']['stodd_core:angle'] for o in lp['overrides']]
ok(angles == sorted(angles), 'override thresholds ascend')
for o in lp['overrides']: ok(os.path.exists('%s/assets/stodd_core/models/item/%s.json' % (R, o['model'].split('/')[-1])), 'model ' + o['model'])
ok(os.path.exists(R + '/assets/stodd_core/textures/item/log_pose_glass.png'), 'Log Pose overlay texture')
ok(jload(R + '/assets/stodd_core/lang/en_us.json').get('item.stodd_core.log_pose') == 'Log Pose', 'Log Pose name')
rc = jload(R + '/data/stodd_core/recipes/log_pose.json')
ok(rc['result']['item'] == 'stodd_core:log_pose' and len(rc['ingredients']) == 3, 'Log Pose recipe')

# 5. the world pack equals the jar's data copies
wp = R + '/packs/stodd_world'
ok(jload(wp + '/pack.mcmeta')['pack']['pack_format'] == 15, 'world pack format 15 (1.20.1)')
k = 0
for root, _, files in os.walk(wp + '/data'):
    for f in files:
        rel = os.path.relpath(os.path.join(root, f), wp + '/data')
        ok(open(os.path.join(root, f), 'rb').read() == open(R + '/data/' + rel, 'rb').read(), 'world pack file %s equals the data copy' % rel)
        k += 1
ok(k >= 19, 'world pack has the %d world files' % k)
ok(os.path.exists(wp + '/data/minecraft/worldgen/noise_settings/overworld.json'), 'world pack overrides the overworld noise settings')
ok('"packs/stodd_world"' in src, 'WorldPack.java reads packs/stodd_world')

# 6. embedded index, version everywhere
ver = open(R + '/embedded/version.txt').read().strip()
toml = open(R + '/META-INF/mods.toml').read()
ok('version="%s"' % ver in toml, 'mods.toml version = embedded version (%s)' % ver)
ok(('mod_version=%s' % ver) in open(M + '/gradle.properties').read(), 'gradle.properties version')
idx = [l.split('\t') for l in open(R + '/embedded/index.txt').read().splitlines() if l.strip()]
for pol, rel in idx:
    ok(pol in 'SCK' and os.path.exists(R + '/embedded/' + rel), 'embedded %s %s' % (pol, rel))
ok(any(r == 'kubejs/server_scripts/stodd/02_rules.js' for _, r in idx), '02_rules.js is embedded')
ok(any(p == 'K' and r == 'config/stodd_islands.properties' for p, r in idx), 'stodd_islands.properties is an owner file')
ok(not os.path.exists(R + '/embedded/config/survivalisland.json'), 'survivalisland.json is not shipped (written from the properties)')

print('%d checks, %d problems' % (checks[0], len(errs)))
for e in errs[:40]: print('  PROBLEM:', e)
sys.exit(1 if errs else 0)
