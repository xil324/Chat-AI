# Image Recognition Models

## Required Files

1. **MobileNetV2 ONNX Model** (`mobilenetv2-7.onnx`)
   - Download from: https://github.com/onnx/models/raw/main/validated/vision/classification/mobilenet/model/mobilenetv2-7.onnx
   - Or: https://github.com/onnx/models/tree/main/validated/vision/classification/mobilenet

2. **ImageNet Labels** (`imagenet_classes.txt`) - ✅ Already downloaded

## Quick Download

```bash
cd models
curl -L -o mobilenetv2-7.onnx https://github.com/onnx/models/raw/main/validated/vision/classification/mobilenet/model/mobilenetv2-7.onnx
```

## Verify

After downloading, verify the file exists:
```bash
ls -lh models/mobilenetv2-7.onnx
```

The file should be approximately 13-14 MB.
