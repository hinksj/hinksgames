#!/usr/bin/env python3
"""Generate Windward's art set via the OpenAI image API (see docs/ART_SPEC.md).

Reads OPENAI_API_KEY from the environment or from conceptstudio/.env.
Usage:
    python3 scripts/gen_art.py --batch core        # 5 hulls + 4 backdrops
    python3 scripts/gen_art.py --only hull_sloop   # one asset (style test)
    python3 scripts/gen_art.py --batch portraits   # phase 2, after style is approved

Model: openai-image-2 (falls back to gpt-image-1 if unavailable).
Output lands in assets/art/ with the exact names the renderer looks for.
"""
import argparse
import base64
import json
import os
import re
import subprocess
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'art')
ENV_CANDIDATES = [
    os.path.expanduser('~/Documents/GitHub/conceptstudio/.env'),
    os.path.join(ROOT, '.env'),
]
MODELS = ['openai-image-2', 'gpt-image-1']

STYLE = (
    'Painterly video game sprite art for a Napoleonic-era naval roguelike. '
    'Muted period palette: tar black, oak brown, sailcloth cream, brass gold, deep blue-green sea. '
    'Clean readable silhouette, soft light from the upper right. No text, no watermark, no UI.'
)

def hull(desc):
    return (
        f'{STYLE} Strict side view of a wooden sailing ship HULL ONLY, bow pointing right. '
        'NO masts, NO sails, NO rigging above the deck rail - only the hull from deck rail down to the waterline. '
        f'A long, flat, uncluttered main deck (game tiles are drawn on top of it). {desc} '
        'Transparent background. The hull spans nearly the full width of the frame, waterline at the bottom edge.'
    )

def backdrop(mood):
    return (
        'Painterly open-ocean seascape backdrop for a naval video game, wide landscape composition, '
        f'horizon line slightly above the vertical center, no ships, no land, no text. {mood} '
        'Muted, atmospheric, dark enough for light-colored UI text to overlay readably.'
    )

CHART = (
    'Antique sea-chart island stamp in the style of 18th-century cartography: '
    'a small irregular island drawn in sepia ink with a light watercolor wash '
    '(pale sand, faded green), coastal hatching and stipple shading along one side, '
    'viewed from above, fully transparent background, no text, no border, no frame. ')

ASSETS = {
    # --- core batch ---
    'hull_sloop': dict(batch='core', transparent=True, prompt=hull(
        'A small sleek smuggler sloop: curved sheer line, single gold stripe along the side, '
        'three small lit stern-gallery windows at the left end, modest figurehead at the bow, '
        'weathered oak planking, a few gun ports.')),
    'hull_cutter': dict(batch='core', transparent=True, prompt=hull(
        'A rough corsair cutter: patched mismatched planking, small and mean, scuffed dark timbers, minimal decoration.')),
    'hull_brig': dict(batch='core', transparent=True, prompt=hull(
        'A plain working naval brig: sturdy lines, ordered gun ports, modest stern windows, honest and unglamorous.')),
    'hull_frigate': dict(batch='core', transparent=True, prompt=hull(
        'A disciplined naval frigate: long gun deck, black-and-ochre paint scheme, orderly row of gun ports, trim and formal.')),
    'hull_leviathan': dict(batch='core', transparent=True, prompt=hull(
        'A colossal ornate Admiralty flagship: black and gold, towering stern gallery with many lit windows, '
        'two rows of gun ports, gilded baroque carvings, dread and grandeur.')),
    'bg_fair': dict(batch='core', jpeg=True, prompt=backdrop(
        'Calm dawn: low gold-and-rose light, gentle long swell, scattered soft clouds.')),
    'bg_squall': dict(batch='core', jpeg=True, prompt=backdrop(
        'Grey-green overcast: heavy rolling cloud, rising chop, curtains of distant rain.')),
    'bg_gloom': dict(batch='core', jpeg=True, prompt=backdrop(
        'Unnatural violet dusk: strange indigo sky, a pale sickle moon, black glassy water, thin drifting mist.')),
    'bg_storm': dict(batch='core', jpeg=True, prompt=backdrop(
        'The inside of a supernatural storm: near-black sky, huge waves, purple-grey churn, '
        'the faint suggestion of a vast slow spiral overhead.')),
    # --- chart dressing: the sea-chart's hand-drawn pieces ---
    'isle1': dict(batch='chart', transparent=True, square=True,
                  prompt=CHART + 'A hilly islet with a few tiny inked palm trees.'),
    'isle2': dict(batch='chart', transparent=True, square=True, prompt=CHART + 'A low sandy atoll with a lagoon.'),
    'isle3': dict(batch='chart', transparent=True, square=True, prompt=CHART + 'Twin jagged rocks with breakers around them.'),
    'isle4': dict(batch='chart', transparent=True, square=True, prompt=CHART + 'A crescent-shaped island with a sheltered bay.'),
    'isle5': dict(batch='chart', transparent=True, square=True, prompt=CHART + 'A small volcanic cone island with a smoke wisp.'),
    'isle6': dict(batch='chart', transparent=True, square=True, prompt=CHART + 'A long low wooded islet.'),
    'seal': dict(batch='chart', transparent=True, square=True, prompt=(
        'A round red sealing-wax seal stamp, embossed with a small anchor, slightly irregular '
        'melted edges, viewed from directly above, soft sheen, fully transparent background, no text.')),
    'rose': dict(batch='chart', transparent=True, square=True, prompt=(
        'An antique hand-inked eight-point compass rose in sepia ink, 18th-century chart style, '
        'slightly worn, a small letter N at the top point, fully transparent background, no other text.')),
    'serpent': dict(batch='chart', transparent=True, square=True, prompt=(
        'A small antique sea-chart decoration: a sea serpent drawn in sepia ink curling through '
        'stylized waves, 18th-century engraving style, fully transparent background, no text.')),
    'parchment': dict(batch='chart', jpeg=True, prompt=(
        'A blank aged parchment texture, warm cream and tan, subtle stains, fibers and gentle '
        'wrinkles, evenly lit, no text, no drawings, no border — just the empty paper surface.')),
    # --- phase 2: run after the core style is approved ---
    'portrait_human1': dict(batch='portraits', transparent=True, square=True, prompt=(
        f'{STYLE} Bust portrait of a weathered Napoleonic-era sailor, plain working clothes, '
        'kind tired eyes. Head and shoulders, transparent background.')),
    'portrait_selkie1': dict(batch='portraits', transparent=True, square=True, prompt=(
        f'{STYLE} Bust portrait of a selkie sailor from folklore: human, but seal-sleek dark hair, '
        'large dark liquid eyes, faint mottling at the temples, oilskin coat. Transparent background.')),
    'portrait_golem1': dict(batch='portraits', transparent=True, square=True, prompt=(
        f'{STYLE} Bust portrait of a shipwright\'s golem: kiln-fired clay figure in sailor\'s slops, '
        'a worn inscribed word on its brow, warm amber eyes, patient expression. Transparent background.')),
    'portrait_storm1': dict(batch='portraits', transparent=True, square=True, prompt=(
        f'{STYLE} Bust portrait of a storm-touched sailor: gaunt, quick-eyed, faint pale '
        'lightning-scar filigree across one cheek and neck, hair slightly adrift. Transparent background.')),
}


def find_key():
    key = os.environ.get('OPENAI_API_KEY')
    if key:
        return key
    for path in ENV_CANDIDATES:
        try:
            with open(path) as fh:
                for line in fh:
                    m = re.match(r'\s*(?:export\s+)?OPENAI_API_KEY\s*=\s*(\S+)', line)
                    if m and not line.lstrip().startswith('#'):
                        return m.group(1).strip('"\'')
        except FileNotFoundError:
            pass
    sys.exit('No OPENAI_API_KEY found (env var, conceptstudio/.env, or windward/.env). '
             'Add it, then re-run.')


def generate(key, name, spec):
    final = os.path.join(OUT, name + ('.jpg' if spec.get('jpeg') else '.png'))
    if os.path.exists(final) and not os.environ.get('FORCE_ART'):
        print(f'  {name}: exists, skipping (set FORCE_ART=1 to regenerate)')
        return True
    size = '1024x1024' if spec.get('square') else '1536x1024'
    last_err = None
    for model in MODELS:
        body = {'model': model, 'prompt': spec['prompt'], 'size': size, 'quality': 'high'}
        if spec.get('transparent'):
            body['background'] = 'transparent'
            body['output_format'] = 'png'
        req = urllib.request.Request(
            'https://api.openai.com/v1/images/generations',
            data=json.dumps(body).encode(),
            headers={'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=300) as resp:
                data = json.loads(resp.read())
            png = base64.b64decode(data['data'][0]['b64_json'])
            os.makedirs(OUT, exist_ok=True)
            path = os.path.join(OUT, f'{name}.png')
            with open(path, 'wb') as fh:
                fh.write(png)
            postprocess(name, spec, path)
            print(f'  {name}: OK via {model}')
            return True
        except urllib.error.HTTPError as e:
            detail = e.read().decode()[:300]
            last_err = f'{model}: HTTP {e.code} {detail}'
            if e.code in (400, 404) and 'model' in detail.lower():
                continue  # try fallback model
            break
        except Exception as e:  # noqa: BLE001
            last_err = f'{model}: {e}'
            break
    print(f'  {name}: FAILED — {last_err}')
    return False


def postprocess(name, spec, path):
    if spec.get('jpeg'):
        jpg = path.replace('.png', '.jpg')
        subprocess.run(['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', '82',
                        path, '--out', jpg], capture_output=True)
        os.remove(path)
    elif name.startswith('hull_'):
        subprocess.run(['sips', '--resampleWidth', '800', path], capture_output=True)
    elif name.startswith('portrait_'):
        subprocess.run(['sips', '--resampleWidth', '192', path], capture_output=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--batch', choices=['core', 'chart', 'portraits'])
    ap.add_argument('--only', help='generate a single named asset')
    args = ap.parse_args()
    todo = ([args.only] if args.only
            else [k for k, v in ASSETS.items() if v['batch'] == (args.batch or 'core')])
    key = find_key()
    print(f'Generating {len(todo)} asset(s) into {OUT}')
    ok = sum(generate(key, n, ASSETS[n]) for n in todo if n in ASSETS)
    print(f'{ok}/{len(todo)} succeeded.')


if __name__ == '__main__':
    main()
