"""Phase 0 spike for issue 150: reference scores from the official TFLite model.

Reads raw mono 48 kHz float32 audio and prints the logits of each 3-second
window as JSON. Used to check that another runtime or a converted model gives
the same answers as the official file.

Usage: python tflite_ref.py model.tflite clip.f32 [max_windows]
"""

import json
import sys

import numpy as np
import tensorflow as tf

WINDOW = 144000

model_path, clip_path = sys.argv[1], sys.argv[2]
limit = int(sys.argv[3]) if len(sys.argv) > 3 else 4

interpreter = tf.lite.Interpreter(model_path=model_path, num_threads=4)
interpreter.allocate_tensors()
inputs = interpreter.get_input_details()
outputs = interpreter.get_output_details()

samples = np.fromfile(clip_path, dtype=np.float32)
rows = []
for start in range(0, max(len(samples) - WINDOW + 1, 1), WINDOW)[:limit]:
    frame = np.zeros(WINDOW, dtype=np.float32)
    chunk = samples[start : start + WINDOW]
    frame[: len(chunk)] = chunk
    interpreter.set_tensor(inputs[0]["index"], frame[np.newaxis, :])
    interpreter.invoke()
    rows.append(interpreter.get_tensor(outputs[0]["index"])[0].tolist())

details = {
    "inputs": [{"name": d["name"], "shape": d["shape"].tolist(), "dtype": str(d["dtype"].__name__)} for d in inputs],
    "outputs": [{"name": d["name"], "shape": d["shape"].tolist(), "dtype": str(d["dtype"].__name__)} for d in outputs],
}
json.dump({"details": details, "logits": rows}, sys.stdout)
