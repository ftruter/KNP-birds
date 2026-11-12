"""Bench fixtures from one evaluation photo: models/test.rgb (the 224 x 224 pixels the Python
reference is given, as float32) and models/test-12mp.jpg (the same photo blown up to 4000 x 3000,
to time decoding and shrinking a phone-sized picture). Prints the photo's species and class index."""
import os, numpy as np
from PIL import Image
from common import rows, EN
from inat import HERE

p, y, r = next(x for x in rows("eval") if x[2]["slug"] == "coracias-caudatus")
im = Image.open(p).convert("RGB")
w, h = im.size
s = 255 / min(w, h)  # same as the evaluation transform: shorter side to 255, then the middle 224
small = im.resize((round(w * s), round(h * s)), Image.BILINEAR)
l, t = (small.width - 224) // 2, (small.height - 224) // 2
np.asarray(small.crop((l, t, l + 224, t + 224)), "float32").tofile(os.path.join(HERE, "models", "test.rgb"))
im.resize((4000, 3000), Image.LANCZOS).save(os.path.join(HERE, "models", "test-12mp.jpg"), quality=90)
print(EN[y], "class", y, "photo", r["photo"], "observation", r["observation"], r["attribution"])
