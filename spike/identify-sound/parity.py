"""Phase 0 spike for issue 150: does the ONNX conversion match the official model?

Runs the same 3-second windows through the official TFLite file and an ONNX
file, and reports how far the logits differ and whether the top five agree.

Usage: python parity.py official.tflite converted.onnx clip [clip ...]
"""

import subprocess
import sys

import numpy as np
import onnxruntime as ort
import tensorflow as tf

WINDOW = 144000


def decode(path, seconds=12):
    command = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", path, "-t", str(seconds)]
    command += ["-ac", "1", "-ar", "48000", "-f", "f32le", "pipe:1"]
    return np.frombuffer(subprocess.run(command, capture_output=True, check=True).stdout, dtype=np.float32)


tflite_path, onnx_path, clips = sys.argv[1], sys.argv[2], sys.argv[3:]
interpreter = tf.lite.Interpreter(model_path=tflite_path, num_threads=4)
interpreter.allocate_tensors()
tfl_in = interpreter.get_input_details()[0]["index"]
tfl_out = interpreter.get_output_details()[0]["index"]
session = ort.InferenceSession(onnx_path, providers=["CPUExecutionProvider"])
onnx_in = session.get_inputs()[0]
print("onnx input", onnx_in.name, onnx_in.shape, "output", session.get_outputs()[0].shape)

windows = 0
top1_same = 0
top5_same = 0
worst = 0.0
for clip in clips:
    samples = decode(clip)
    for start in range(0, len(samples) - WINDOW + 1, WINDOW):
        frame = samples[start : start + WINDOW][np.newaxis, :]
        interpreter.set_tensor(tfl_in, frame)
        interpreter.invoke()
        official = interpreter.get_tensor(tfl_out)[0]
        converted = session.run(None, {onnx_in.name: frame})[0][0]
        order = np.argsort(official)[::-1]
        other = np.argsort(converted)[::-1]
        windows += 1
        top1_same += int(order[0] == other[0])
        top5_same += int(set(order[:5]) == set(other[:5]))
        worst = max(worst, float(np.abs(official[order[:20]] - converted[order[:20]]).max()))

print(f"windows {windows}, same top-1 {top1_same}, same top-5 set {top5_same}, largest logit gap in top 20: {worst:.4f}")
