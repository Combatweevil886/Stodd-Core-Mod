"""Draws the STODD Chrome item icons (16 x 16 pixel art) and the logos of STODD Chrome and STODD Core.
   python3 tools/gen_chrome_art.py  (needs Pillow)"""
import os, math
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEX = os.path.join(ROOT, 'chrome/src/main/resources/assets/stodd_chrome/textures/item')

SHAPES = {
 'chip': """
................
..K.K.K.K.K.K...
.KKKKKKKKKKKKK..
KKDDDDDDDDDDDDKK
.KDMMMMMMMMMMDK.
KKDMAAAMMBAAMDKK
.KDMAKKAABKAMDK.
KKDMMAKBBKAMMDKK
.KDMMMABBAMMMDK.
KKDMAKBAAKKAMDKK
.KDMAAMMMAAAMDK.
KKDMMMMMMMMMMDKK
.KDDDDDDDDDDDDK.
..KKKKKKKKKKKK..
..K.K.K.K.K.K...
................""",
 'plate': """
................
....KKKKKKKK....
...KMLMMLMMLK...
..KMAMKMAMKMAK..
.KLMKMLMKMLMKMK.
.KMAMKMBMKMAMKK.
.KMKMLMKMLMKMLK.
.KMAMKMAMKMBMKK.
.KLMKMLMKMLMKMK.
.KMBMKMAMKMAMKK.
..KMKMLMKMLMKK..
...KMAMKMAMKK...
....KMKMLMKK....
.....KKKKKK.....
................
................""",
 'hand': """
................
...K.K.K.K......
..KLKLKLKLK.....
..KMKMKMKMK.....
..KMKMKMKMK.....
..KAKAKAKAK.KK..
..KMMMMMMMKKLK..
..KMMMMMMMMKMK..
..KDMAAAMMMMK...
..KDMABAMMMK....
..KDMAAAMMK.....
...KDMMMMMK.....
....KDDDDK......
....KDAADK......
....KDDDDK......
.....KKKK.......""",
 'heart': """
................
....K......K....
...KLK....KMK...
..KDMK.KK.KMK...
...KMKKRRKKMK...
..KKKRRSSRRKK...
.KRRSSGSSSSRRK..
.KRSSSSSSSSSRK..
.KRSSSASSSSSRK..
.KRRSSBASSSRRK..
..KRRSSBSSRRK...
...KRRSSSRRK....
....KRRSRRK.....
.....KRRRK......
......KRK.......
.......K........""",
 'brain': """
................
....KKKKKKK.....
..KKAAMAAAAKK...
.KAAMAAMAAMAAK..
.KAMAAMKAMAAMK..
KAAMAMAAKAAMAAK.
KAMAAKAMAKMAAMK.
KAAMAAMAAKAMAAK.
.KAMAAMKAAMAAK..
.KKAAMAKAMAAKK..
...KKKKKKKKKK...
.....KDLLDK.....
.....KDBBDK.....
......KDDK......
.......KK.......
................""",
 'leg': """
................
.....KKKK.......
....KLMMDK......
....KMMMDK......
....KDMMDK......
.....KAAK.......
....KABBAK......
.....KAAK.......
....KDMMDK......
....KMMMDK......
.....KMMDK......
.....KAAK.......
....KABBAK......
....KDMMMKKK....
....KDMMMMMMK...
....KKKKKKKKK...""",
}

BASE = {'K': (22, 22, 28), 'D': (58, 60, 70), 'M': (112, 116, 130), 'L': (178, 184, 198), 'R': (120, 18, 30), 'S': (200, 40, 52)}
MID = {'A': (0, 150, 185), 'B': (110, 235, 255), 'G': (230, 255, 255)}
END = {'A': (170, 30, 150), 'B': (255, 120, 225), 'G': (255, 230, 140)}

ICONS = {
    # mid game (cyan)
    'synaptic_accelerator': ('chip', MID), 'subdermal_plating': ('plate', MID), 'grip_servos': ('hand', MID),
    'adrenal_pump': ('heart', MID), 'lynx_tendons': ('leg', MID),
    # end game (magenta and gold)
    'kerenzikov_reflex_core': ('chip', END), 'titan_dermal_weave': ('plate', END), 'monowire_grips': ('hand', END),
    'second_heart': ('heart', END), 'overclocked_neocortex': ('brain', END), 'apex_sprint_actuators': ('leg', END),
}

def icon(shape, pal):
    rows = [r for r in SHAPES[shape].strip('\n').split('\n')]
    im = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    colours = dict(BASE); colours.update(pal)
    if shape == 'heart' and pal is END:
        colours['S'] = (230, 50, 70); colours['G'] = (255, 230, 140)
    for y, row in enumerate(rows[:16]):
        for x, ch in enumerate(row[:16]):
            if ch in colours: im.putpixel((x, y), colours[ch] + (255,))
    return im

def font(size, bold=True):
    for p in ['/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf']:
        if os.path.exists(p): return ImageFont.truetype(p, size)
    return ImageFont.load_default()

def neon_text(base, text, y, size, colour, glow):
    f = font(size)
    layer = Image.new('RGBA', base.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    w = d.textlength(text, font=f)
    x = (base.size[0] - w) / 2
    d.text((x, y), text, font=f, fill=glow + (255,))
    base.alpha_composite(layer.filter(ImageFilter.GaussianBlur(6)))
    base.alpha_composite(layer.filter(ImageFilter.GaussianBlur(2)))
    d2 = ImageDraw.Draw(base)
    d2.text((x, y), text, font=f, fill=colour + (255,))

def chrome_logo(path):
    S = 256
    im = Image.new('RGBA', (S, S))
    px = im.load()
    for y in range(S):
        for x in range(S):
            t = y / S
            px[x, y] = (int(14 + 30 * t), int(10 + 6 * t), int(30 + 40 * t), 255)
    d = ImageDraw.Draw(im)
    # a neon grid floor
    for i in range(0, S, 16):
        d.line([(i, 150), (S / 2 + (i - S / 2) * 3, S)], fill=(150, 40, 170, 120), width=1)
    for k in range(8):
        yy = 150 + int((k / 8) ** 2 * 106)
        d.line([(0, yy), (S, yy)], fill=(150, 40, 170, 110), width=1)
    # the big chip, glowing
    chip = icon('chip', END).resize((128, 128), Image.NEAREST)
    glow = Image.new('RGBA', im.size, (0, 0, 0, 0))
    glow.alpha_composite(chip, (64, 40))
    r, g, b, a = glow.split()
    halo = Image.merge('RGBA', (r.point(lambda v: 255), g.point(lambda v: 80), b.point(lambda v: 220), a)).filter(ImageFilter.GaussianBlur(10))
    im.alpha_composite(halo)
    im.alpha_composite(chip, (64, 40))
    neon_text(im, 'STODD', 6, 36, (235, 250, 255), (0, 200, 255))
    neon_text(im, 'CHROME', 184, 44, (255, 225, 245), (255, 60, 200))
    # a thin frame
    d = ImageDraw.Draw(im)
    d.rectangle([2, 2, S - 3, S - 3], outline=(0, 220, 255, 255), width=3)
    im.save(path)

def core_logo(path):
    S = 256
    im = Image.new('RGBA', (S, S))
    px = im.load()
    for y in range(S):
        for x in range(S):
            t = y / S
            px[x, y] = (int(60 + 80 * (1 - t)), int(150 + 60 * (1 - t)), int(220 + 30 * (1 - t)), 255) if y < 160 else (10, int(80 - 30 * (t - 0.62)), int(140 - 40 * (t - 0.62)), 255)
    d = ImageDraw.Draw(im)
    # sea glints
    for i in range(14):
        x = (i * 37) % S; y = 168 + (i * 23) % 80
        d.line([(x, y), (x + 14, y)], fill=(120, 190, 240, 200), width=2)
    # a ground island with a palm and a sky island over it
    d.ellipse([40, 140, 216, 196], fill=(222, 200, 140, 255))
    d.ellipse([58, 128, 198, 178], fill=(70, 160, 70, 255))
    d.polygon([(150, 60), (178, 110), (122, 110)], fill=(240, 240, 250, 255))
    d.rectangle([126, 84, 132, 140], fill=(110, 80, 50, 255))
    for a in (-60, -20, 20, 60, 200, 240):
        rad = math.radians(a)
        d.line([(129, 84), (129 + 26 * math.cos(rad), 84 + 14 * math.sin(rad))], fill=(40, 140, 60, 255), width=5)
    # the sky island
    d.ellipse([20, 40, 104, 62], fill=(80, 170, 80, 255))
    d.polygon([(24, 52), (100, 52), (62, 96)], fill=(120, 96, 70, 255))
    # clouds
    for cx, cy in ((180, 36), (200, 44), (162, 44)):
        d.ellipse([cx - 18, cy - 10, cx + 18, cy + 10], fill=(255, 255, 255, 235))
    neon_text(im, 'STODD', 192, 40, (255, 255, 255), (0, 60, 120))
    d = ImageDraw.Draw(im)
    d.rectangle([2, 2, S - 3, S - 3], outline=(250, 210, 90, 255), width=3)
    im.save(path)

if __name__ == '__main__':
    os.makedirs(TEX, exist_ok=True)
    for name, (shape, pal) in ICONS.items():
        icon(shape, pal).save(os.path.join(TEX, name + '.png'))
    chrome_logo(os.path.join(ROOT, 'chrome/src/main/resources/logo.png'))
    core_logo(os.path.join(ROOT, 'src/main/resources/logo.png'))
    print('icons:', len(ICONS), 'and two logos')
