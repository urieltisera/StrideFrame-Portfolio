# Face validation artifacts

These files are intentionally kept outside Git:

```text
models/insightface/buffalo_l/det_10g.onnx
models/insightface/buffalo_l/w600k_r50.onnx
```

They were obtained from the official InsightFace `buffalo_l` release mechanism:

`https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_l.zip`

Validated files:

| File | Role | SHA-256 |
|---|---|---|
| `det_10g.onnx` | SCRFD-10GF detector | `5838f7fe053675b1c7a08b633df49e7af5495cee0493c7dcf6697200b85b5b91` |
| `w600k_r50.onnx` | ResNet50/WebFace600K ArcFace-compatible recognizer | `4c06341c33c2ca1f86781dab0e829f88ad5b64be9fba56e56bc9ebdefc619e43` |

Status: `DEV_VALIDATION_ONLY`.

InsightFace source code is MIT, but the provided pretrained buffalo_l weights are not approved for StrideFrame commercial production use without a separate commercial model license. Do not ship these weights to production.

The detector uses input tensor `input.1`, NCHW `[1,3,640,640]`, BGR channel order and `(pixel - 127.5) / 128`. Its outputs are three score tensors, three bbox tensors and three five-landmark tensors for strides 8, 16 and 32. The recognizer uses `input.1`, NCHW `[1,3,112,112]`, RGB `(pixel - 127.5) / 127.5` preprocessing and output `683` with 512 values. StrideFrame applies L2 normalization before storage/search.

The model version used for validation is `buffalo_l-scrfd10g-w600k_r50-v1`.
