"""Score the exported .tflite files on every evaluation photo, with the LiteRT interpreter.

    .venv-export/bin/python score-tflite.py mnv4m

Confirms the files the browser will load give the same accuracy as the PyTorch model. Photos are
prepared as the page would: shorter side to 255, the middle 224 x 224, pixels 0 to 255."""
import json, os, sys, time
import numpy as np
from PIL import Image
from ai_edge_litert.interpreter import Interpreter
from common import rows, report, show
from inat import HERE

name = sys.argv[1]
held = rows("eval")
y = [c for _, c, _ in held]


def pixels(p):
    im = Image.open(p).convert("RGB")
    s = 255 / min(im.size)
    im = im.resize((max(224, round(im.width * s)), max(224, round(im.height * s))), Image.BILINEAR)
    l, t = (im.width - 224) // 2, (im.height - 224) // 2
    return np.asarray(im.crop((l, t, l + 224, t + 224)), "float32")[None]


x = [pixels(p) for p, _, _ in held]
out = {}
for kind in ("fp32", "fp16", "int8"):
    path = os.path.join(HERE, "models", f"{name}-{kind}.tflite")
    it = Interpreter(model_path=path, num_threads=1)
    it.allocate_tensors()
    i, o = it.get_input_details()[0]["index"], it.get_output_details()[0]["index"]
    probs = np.zeros((len(x), 493), "float32")
    t0 = time.time()
    for n, px in enumerate(x):
        it.set_tensor(i, px)
        it.invoke()
        probs[n] = it.get_tensor(o)[0]
    r = report(probs, y)
    r["fileMB"] = round(os.path.getsize(path) / 1048576, 2)
    r["msPerPhotoOneThread"] = round(1000 * (time.time() - t0) / len(x), 1)
    del r["perFamily"]
    out[kind] = r
    show(f"{name} {kind} ({r['fileMB']} MB, {r['msPerPhotoOneThread']} ms a photo here)", r)
    np.save(os.path.join(HERE, "runs", name, f"eval-probs-{kind}.npy"), probs)
json.dump(out, open(os.path.join(HERE, f"tflite-{name}.json"), "w"), indent=1)
