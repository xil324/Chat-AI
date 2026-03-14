import * as ort from 'onnxruntime-node';
import fs from 'fs';
import { config } from '../config/index.js';

const INPUT_SIZE = 224;

let recognizer = null;

export async function initImageRecognizer() {
  const { modelPath, labelPath } = config.image;
  if (!modelPath || !labelPath) {
    console.log('[Image] MODEL_PATH or LABEL_PATH not set — image recognition disabled');
    return;
  }
  try {
    recognizer = new ImageRecognizer(modelPath, labelPath);
    await recognizer.init();
    console.log('Image recognizer initialized');
  } catch (err) {
    console.error('[Image] Failed to initialize recognizer:', err.message);
  }
}

export function getRecognizer() {
  return recognizer;
}

class ImageRecognizer {
  constructor(modelPath, labelPath) {
    this.modelPath = modelPath;
    this.labels = fs.readFileSync(labelPath, 'utf-8')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    this.session = null;
  }

  async init() {
    this.session = await ort.InferenceSession.create(this.modelPath);
  }

  async predict(imageBuffer) {
    // canvas is an optional native dep — loaded dynamically so startup doesn't fail if absent
    const { createCanvas } = await import('canvas');
    const { loadImage } = await import('canvas');

    const img = await loadImage(imageBuffer);
    const canvas = createCanvas(INPUT_SIZE, INPUT_SIZE);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, INPUT_SIZE, INPUT_SIZE);
    const imageData = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);

    const { data } = imageData;
    const float32 = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE);

    for (let i = 0; i < INPUT_SIZE * INPUT_SIZE; i++) {
      float32[i] = data[i * 4] / 255.0;
      float32[INPUT_SIZE * INPUT_SIZE + i] = data[i * 4 + 1] / 255.0;
      float32[2 * INPUT_SIZE * INPUT_SIZE + i] = data[i * 4 + 2] / 255.0;
    }

    const inputName = this.session.inputNames[0];
    const tensor = new ort.Tensor('float32', float32, [1, 3, INPUT_SIZE, INPUT_SIZE]);
    const results = await this.session.run({ [inputName]: tensor });

    const output = results[this.session.outputNames[0]].data;
    let maxIdx = 0;
    for (let i = 1; i < output.length; i++) {
      if (output[i] > output[maxIdx]) maxIdx = i;
    }

    return this.labels[maxIdx] || `class_${maxIdx}`;
  }
}
