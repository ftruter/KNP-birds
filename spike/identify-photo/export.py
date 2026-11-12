"""Export a trained run to LiteRT (.tflite) files for the browser, and check them.

    .venv-export/bin/python export.py runs/<name>

The exported model takes one 224 x 224 RGB picture as floats from 0 to 255 (row by row, channels
last) and returns one probability per species: scaling and softmax are inside the file, so the
page only has to hand over pixels. Writes models/<name>-fp32.tflite, -fp16.tflite and -int8.tflite,
models/candidates.json for the bench, models/test.rgb (the reference pixels) and export.json."""
import json, os, sys
import numpy as np, torch, timm, litert_torch
from torch import nn
from ai_edge_litert.interpreter import Interpreter
from ai_edge_quantizer import quantizer, recipe

HERE = os.path.dirname(os.path.abspath(__file__))
run = sys.argv[1].rstrip("/")
name = os.path.basename(run)
cfg = json.load(open(os.path.join(run, "config.json")))
size = cfg["size"]


class Wrapped(nn.Module):
    def __init__(self, net):
        super().__init__()
        self.net = net
        self.register_buffer("mean", torch.tensor(cfg["mean"]).view(1, 3, 1, 1) * 255)
        self.register_buffer("std", torch.tensor(cfg["std"]).view(1, 3, 1, 1) * 255)

    def forward(self, x):  # x: (1, size, size, 3), 0..255
        return torch.softmax(self.net((x.permute(0, 3, 1, 2) - self.mean) / self.std), 1)


net = timm.create_model(cfg["model"], pretrained=False, num_classes=len(cfg["classes"]))
weights = os.path.join(run, "model.pt")
if os.path.exists(weights):
    net.load_state_dict(torch.load(weights, map_location="cpu"))
else:
    print("no model.pt: exporting untrained weights, to test the conversion only")
model = Wrapped(net).eval()

rng = np.random.default_rng(151)
test = os.path.join(HERE, "models", "test.rgb")
if not os.path.exists(test):
    rng.uniform(0, 255, (1, size, size, 3)).astype("float32").tofile(test)
pixels = np.fromfile(test, "float32").reshape(1, size, size, 3)
with torch.no_grad():
    want = model(torch.from_numpy(pixels)).numpy()[0]

out = os.path.join(HERE, "models")
paths = {k: os.path.join(out, f"{name}-{k}.tflite") for k in ("fp32", "fp16", "int8")}
litert_torch.convert(model, (torch.from_numpy(pixels),)).export(paths["fp32"])
FP16 = [{"regex": ".*", "operation": "*", "algorithm_key": "float_casting",
         "op_config": {"weight_tensor_config": {"num_bits": 16, "dtype": "FLOAT"}, "compute_precision": "FLOAT",
                       "explicit_dequantize": True}}]
for kind, rec in (("fp16", FP16), ("int8", recipe.weight_only_wi8_afp32())):
    q = quantizer.Quantizer(paths["fp32"])
    q.load_quantization_recipe(rec)
    q.quantize().export_model(paths[kind], overwrite=True)

report, candidates = {}, []
for kind, p in paths.items():
    if not os.path.exists(p):
        continue
    it = Interpreter(model_path=p)
    it.allocate_tensors()
    it.set_tensor(it.get_input_details()[0]["index"], pixels)
    it.invoke()
    got = it.get_tensor(it.get_output_details()[0]["index"])[0]
    report[kind] = {"fileMB": round(os.path.getsize(p) / 1048576, 2), "maxDifference": float(np.abs(got - want).max()),
                    "sameTop5": bool((np.argsort(-got)[:5] == np.argsort(-want)[:5]).all()),
                    "top3": [[int(i), round(float(got[i]), 4)] for i in np.argsort(-got)[:3]]}
    candidates.append({"id": kind, "name": f"LiteRT.js, {name} {kind}", "model": f"/models/{name}-{kind}.tflite"})
report["pytorchTop3"] = [[int(i), round(float(want[i]), 4)] for i in np.argsort(-want)[:3]]
json.dump(report, open(os.path.join(HERE, "export.json"), "w"), indent=1)
json.dump(candidates, open(os.path.join(out, "candidates.json"), "w"), indent=1)
print(json.dumps(report, indent=1))
