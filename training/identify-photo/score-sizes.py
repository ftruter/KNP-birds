"""Score the trained model at larger input sizes, without retraining. Writes sizes-<name>.json.

    .venv/bin/python score-sizes.py mnv4m

"crop" is how much of the photo's shorter side the model sees: 0.88 is the middle 88%."""
import json, os, sys
import numpy as np, torch, timm
from torchvision import transforms as T
from PIL import Image
from common import rows, report, show
from inat import HERE

name = sys.argv[1]
run = os.path.join(HERE, "runs", name)
cfg = json.load(open(os.path.join(run, "config.json")))
net = timm.create_model(cfg["model"], pretrained=False, num_classes=len(cfg["classes"]))
net.load_state_dict(torch.load(os.path.join(run, "model.pt"), map_location="cpu"))
net = net.to("mps").eval()
held = rows("eval")
y = [c for _, c, _ in held]
out = []
for size, crop in ((224, 0.88), (256, 0.88), (288, 0.88), (320, 0.88), (288, 1.0)):
    tf = T.Compose([T.Resize(round(size / crop)), T.CenterCrop(size), T.ToTensor(), T.Normalize(cfg["mean"], cfg["std"])])
    ps = []
    with torch.no_grad():
        for i in range(0, len(held), 128):
            x = torch.stack([tf(Image.open(p).convert("RGB")) for p, _, _ in held[i:i + 128]]).to("mps")
            ps.append(torch.softmax(net(x), 1).cpu().numpy())
    r = report(np.concatenate(ps), y)
    del r["perFamily"]
    out.append({"size": size, "crop": crop, **r})
    show(f"{size} px, middle {crop:.0%}", r)
json.dump(out, open(os.path.join(HERE, f"sizes-{name}.json"), "w"), indent=1)
