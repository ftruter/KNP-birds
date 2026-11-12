"""Fine-tune one compact pretrained image model on the training photos. Option A prototype.

    .venv/bin/python train.py --model mobilenetv4_conv_medium.e500_r256_in1k --epochs 12

Writes runs/<name>/model.pt (EMA weights), log.jsonl and eval.json. Runs on Apple silicon (MPS)."""
import argparse, json, os, time, math, random
import numpy as np, torch, timm
from torch import nn
from torch.utils.data import Dataset, DataLoader, WeightedRandomSampler
from torchvision import transforms as T
from PIL import Image
from common import rows, SLUGS, report, show
from inat import HERE

ap = argparse.ArgumentParser()
ap.add_argument("--model", default="mobilenetv4_conv_medium.e500_r256_in1k")
ap.add_argument("--name")
ap.add_argument("--epochs", type=int, default=12)
ap.add_argument("--size", type=int, default=224)
ap.add_argument("--batch", type=int, default=128)
ap.add_argument("--lr", type=float, default=5e-5, help="backbone; higher rates wreck the pretrained weights")
ap.add_argument("--head-lr", type=float, default=2e-3)
ap.add_argument("--workers", type=int, default=14)
a = ap.parse_args()
name = a.name or a.model.split(".")[0]
out = os.path.join(HERE, "runs", name)
os.makedirs(out, exist_ok=True)
torch.manual_seed(151); random.seed(151); np.random.seed(151)
dev = "mps" if torch.backends.mps.is_available() else "cpu"

model = timm.create_model(a.model, pretrained=True, num_classes=len(SLUGS))
cfg = timm.data.resolve_data_config({}, model=model)
mean, std = cfg["mean"], cfg["std"]
json.dump({"model": a.model, "size": a.size, "mean": mean, "std": std, "classes": SLUGS},
          open(os.path.join(out, "config.json"), "w"))


class Photos(Dataset):
    def __init__(self, items, tf):
        self.items, self.tf = items, tf

    def __len__(self):
        return len(self.items)

    def __getitem__(self, i):
        p, y, _ = self.items[i]
        try:
            im = Image.open(p).convert("RGB")
        except Exception:
            im = Image.new("RGB", (a.size, a.size))
        return self.tf(im), y


# The visitor crops to the bird by hand, so train on crops of many scales and aspect ratios.
train_tf = T.Compose([T.RandomResizedCrop(a.size, scale=(0.25, 1), ratio=(0.75, 1.33)), T.RandomHorizontalFlip(),
                      T.ColorJitter(0.3, 0.3, 0.2), T.ToTensor(), T.Normalize(mean, std), T.RandomErasing(0.2)])
eval_tf = T.Compose([T.Resize(int(a.size * 1.14)), T.CenterCrop(a.size), T.ToTensor(), T.Normalize(mean, std)])
train, held = rows("train"), rows("eval")
count = np.bincount([y for _, y, _ in train], minlength=len(SLUGS))
# Sample rare species more often, but not fully balanced: weight = count ** -0.5.
weights = [count[y] ** -0.5 for _, y, _ in train]
sampler = WeightedRandomSampler(weights, len(train), replacement=True)
kw = dict(num_workers=a.workers, persistent_workers=True, multiprocessing_context="fork")
tl = DataLoader(Photos(train, train_tf), a.batch, sampler=sampler, drop_last=True, **kw)
el = DataLoader(Photos(held, eval_tf), 256, **kw)
print(f"{len(train)} training photos, {len(held)} evaluation photos, device {dev}", flush=True)

model = model.to(dev)  # not channels_last: on MPS it is nearly three times slower
ema = timm.utils.ModelEmaV3(model, decay=0.9995)
head = [p for n, p in model.named_parameters() if n.startswith(model.default_cfg["classifier"])]
body = [p for n, p in model.named_parameters() if not n.startswith(model.default_cfg["classifier"])]
opt = torch.optim.AdamW([{"params": head, "lr": a.head_lr}, {"params": body, "lr": a.lr}], weight_decay=0.01)
steps = a.epochs * len(tl)
warm = len(tl)
sched = torch.optim.lr_scheduler.LambdaLR(
    opt, lambda s: s / warm if s < warm else 0.5 * (1 + math.cos(math.pi * (s - warm) / (steps - warm))))
loss_fn = nn.CrossEntropyLoss(label_smoothing=0.1)


def evaluate(m):
    m.eval()
    ps, ys = [], []
    with torch.no_grad():
        for x, y in el:
            ps.append(torch.softmax(m(x.to(dev)), 1).cpu().numpy())
            ys.append(y.numpy())
    return np.concatenate(ps), np.concatenate(ys)


for epoch in range(a.epochs):
    model.train()
    t0, total, n = time.time(), 0.0, 0
    for x, y in tl:
        x, y = x.to(dev), y.to(dev)
        loss = loss_fn(model(x), y)
        opt.zero_grad(set_to_none=True)
        loss.backward()
        opt.step(); sched.step(); ema.update(model)
        total += loss.item(); n += 1
    line = {"epoch": epoch + 1, "loss": total / n, "seconds": round(time.time() - t0)}
    r = report(*evaluate(model))
    line.update(top1=r["top1"], top3=r["top3"], family=r["familyBySum"])
    if (epoch + 1) % 3 == 0 or epoch + 1 == a.epochs:
        r = report(*evaluate(ema.module))
        line.update(emaTop1=r["top1"], emaTop3=r["top3"], emaFamily=r["familyBySum"])
    print(json.dumps(line), flush=True)
    open(os.path.join(out, "log.jsonl"), "a").write(json.dumps(line) + "\n")

torch.save(ema.module.state_dict(), os.path.join(out, "model.pt"))
p, y = evaluate(ema.module)
np.save(os.path.join(out, "eval-probs.npy"), p)
r = report(p, y)
r["params"] = sum(t.numel() for t in model.parameters())
json.dump(r, open(os.path.join(out, "eval.json"), "w"), indent=1)
show(name, r)
