# Test photo for /identify/photo

`crested-barbet.jpg` is a Crested Barbet (_Trachyphonus vaillantii_) by iNaturalist user tim_kirsten, from
[observation 163519993](https://www.inaturalist.org/observations/163519993) (photo 282824738, "medium" size).
The photographer released it under CC0 (no rights reserved).

`test/identify-photo-browser.test.js` feeds it through the page. It is one of the model's held-out test
photos, so it was not used for training.

`detector-barbet.json` is what the detector (EfficientDet-Lite0, `data/models/bird-detector.tflite`) says about
that photo, as the recognition worker would hand it to the page with a score cut-off of 0.05: the anchors
that score as "bird", their scores and their shifts. `picked` is the boxes `training/identify-photo/score-detect.py`
makes of them (score, top, left, bottom, right, as shares of the detector's 320-pixel square, best first).
`test/identify-photo.test.js` holds the page's own box picking to it.
