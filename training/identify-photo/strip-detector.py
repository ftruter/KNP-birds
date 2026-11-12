"""Make the detector the page runs from Google's EfficientDet-Lite0 file (issue 180).

    .venv-export/bin/python strip-detector.py efficientdet-lite0

Reads models/<name>.tflite, the "detection/metadata" file from TensorFlow Hub (Apache 2.0), and
writes models/<name>-raw.tflite and ../../data/models/bird-detector.tflite when <name> is the one
the site uses.

The only change is that the file's last step is removed. That step (TFLite_Detection_PostProcess)
picks the 25 best boxes, and its outputs have no fixed size, which LiteRT.js cannot run. Without it
the file returns, for each of its 19,206 fixed anchor boxes, a score for each of 90 classes and
four numbers that move and resize the anchor. The page picks the boxes itself
(src/client/identify-photo.js). The weights are not touched.

Also checks that the anchors the page works out for itself are the ones in the file."""
import hashlib, os, sys
import flatbuffers
import numpy as np
from flatbuffers import flexbuffers
from ai_edge_litert import schema_py_generated as schema
from ai_edge_litert.interpreter import Interpreter
from common import anchors
from inat import HERE

name = sys.argv[1]
source = open(os.path.join(HERE, "models", f"{name}.tflite"), "rb").read()
model = schema.ModelT.InitFromPackedBuf(source, 0)
graph = model.subgraphs[0]
last = graph.operators[-1]
assert model.operatorCodes[last.opcodeIndex].customCode == b"TFLite_Detection_PostProcess"
options = flexbuffers.Loads(bytes(last.customOptions))
# The page's own box picking assumes these.
assert [options[k] for k in ("y_scale", "x_scale", "h_scale", "w_scale")] == [1, 1, 1, 1], options
boxes, scores, anchors = (int(i) for i in last.inputs)
stored = np.frombuffer(bytes(model.buffers[graph.tensors[anchors].buffer].data), "float32").reshape(-1, 4)
side = int(graph.tensors[graph.inputs[0]].shape[1])
made = anchors(side)
assert made.shape == stored.shape, (made.shape, stored.shape)
worst = float(np.abs(made - stored).max())
assert worst < 1e-4, f"the page's anchors differ from the file's by up to {worst}"

graph.operators = graph.operators[:-1]
graph.outputs = [scores, boxes]
builder = flatbuffers.Builder(len(source))
builder.Finish(model.Pack(builder), b"TFL3")
raw = bytes(builder.Output())
out = os.path.join(HERE, "models", f"{name}-raw.tflite")
open(out, "wb").write(raw)

check = Interpreter(model_path=out)
check.allocate_tensors()
shapes = [d["shape"].tolist() for d in check.get_output_details()]
assert shapes == [[1, len(stored), options["num_classes"]], [1, len(stored), 4]], shapes
print(f"{out}: {len(raw)} bytes, sha256 {hashlib.sha256(raw).hexdigest()}")
print(f"input {side}, {len(stored)} anchors (the page's differ by at most {worst:.1e}), {options}")
if name == "efficientdet-lite0":
    site = os.path.join(HERE, "..", "..", "data", "models", "bird-detector.tflite")
    open(site, "wb").write(raw)
    print("copied to", os.path.normpath(site))
