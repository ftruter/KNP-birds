"""Score models that already exist on the evaluation photos.

  inat21    birder-project/resnet_v2_50_inat21 (ResNet-50, iNaturalist 2021, 10,000 classes). Option B.
  kaggle    chriamue/bird-species-classifier (EfficientNet-B2, 525 species). Option B, compact.
  bioclip2  imageomics/bioclip-2 zero-shot over our 493 names. Reference for option C.

Scores are limited to our species (the "Kruger filter"). Writes baselines.json."""
import json, os, re, sys
import numpy as np, torch
from PIL import Image
from common import rows, SLUGS, SPECIES, INDEX, EN, report, show
from inat import HERE, REPO

dev = "mps"
held = rows("eval")
labels = [y for _, y, _ in held]
which = sys.argv[1:] or ["inat21", "kaggle", "bioclip2"]
path = os.path.join(HERE, "baselines.json")
results = json.load(open(path)) if os.path.exists(path) else {}


def batches(tf, size=128):
    for i in range(0, len(held), size):
        yield torch.stack([tf(Image.open(p).convert("RGB")) for p, _, _ in held[i:i + size]]).to(dev)


def finish(name, probs, covered, extra):
    np.save(os.path.join(HERE, "runs", f"{name}-eval-probs.npy"), probs)
    r = {"coveredSpecies": len(covered), **extra,
         "onCovered": report(probs, labels, covered), "onAll": report(probs, labels)}
    show(name + " (covered species only)", r["onCovered"])
    show(name + " (all photos)", r["onAll"])
    results[name] = r
    json.dump(results, open(path, "w"), indent=1)


os.makedirs(os.path.join(HERE, "runs"), exist_ok=True)

if "inat21" in which:
    import birder
    net, info = birder.load_pretrained_model("resnet_v2_50_inat21-256px", inference=True)
    tf = birder.classification_transform(birder.get_size_from_signature(info.signature), info.rgb_stats)
    mapping = json.load(open(os.path.join(HERE, "models", "inat21-map.json")))  # slug -> class index
    net = net.to(dev).eval()
    cols = [INDEX[s] for s in mapping]
    idx = [mapping[s] for s in mapping]
    probs = np.zeros((len(held), len(SLUGS)), "float32")
    n = 0
    with torch.no_grad():
        for x in batches(tf):
            logits = net(x)[:, idx]  # keep only our species, then renormalise
            probs[n:n + len(x), cols] = torch.softmax(logits, 1).cpu().numpy()
            n += len(x)
    finish("inat21", probs, set(cols), {"params": 44.0e6, "fileMB": 169})

if "kaggle" in which:
    from transformers import AutoModelForImageClassification, AutoImageProcessor
    m = AutoModelForImageClassification.from_pretrained("chriamue/bird-species-classifier").to(dev).eval()
    proc = AutoImageProcessor.from_pretrained("chriamue/bird-species-classifier")
    norm = lambda s: re.sub(r"[^a-z]", "", s.lower().replace("grey", "gray"))
    by_name = {norm(v): int(k) for k, v in m.config.id2label.items()}
    mapping = {i: by_name[norm(en)] for i, en in enumerate(EN) if norm(en) in by_name}  # exact English name only
    cols, idx = list(mapping), [mapping[c] for c in mapping]
    tf = lambda im: proc(im, return_tensors="pt")["pixel_values"][0]
    probs = np.zeros((len(held), len(SLUGS)), "float32")
    n = 0
    with torch.no_grad():
        for x in batches(tf):
            probs[n:n + len(x), cols] = torch.softmax(m(pixel_values=x).logits[:, idx], 1).cpu().numpy()
            n += len(x)
    finish("kaggle525", probs, set(cols), {"params": sum(p.numel() for p in m.parameters()), "fileMB": 34})

if "bioclip2" in which:
    import open_clip
    model, _, tf = open_clip.create_model_and_transforms("hf-hub:imageomics/bioclip-2")
    tok = open_clip.get_tokenizer("hf-hub:imageomics/bioclip-2")
    model = model.to(dev).eval()
    text = [f'a photo of {s["scientificName"]} with common name {s["commonNames"]["en"]}.' for s in SPECIES]
    with torch.no_grad():
        t = model.encode_text(tok(text).to(dev))
        t = t / t.norm(dim=-1, keepdim=True)
        feats = []
        for x in batches(tf, 64):
            f = model.encode_image(x)
            feats.append((f / f.norm(dim=-1, keepdim=True)).cpu())
        f = torch.cat(feats)
        probs = torch.softmax(model.logit_scale.exp().cpu() * f @ t.cpu().T, 1).numpy()
    np.save(os.path.join(HERE, "runs", "bioclip2-eval-feats.npy"), f.numpy())
    finish("bioclip2-zeroshot", probs, set(range(len(SLUGS))),
           {"params": sum(p.numel() for p in model.visual.parameters()), "fileMB": 1710})
