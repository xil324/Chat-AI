import { getRecognizer } from '../utils/image.js';

export async function recognizeImage(imageBuffer) {
  const recognizer = getRecognizer();
  if (!recognizer) {
    const err = new Error('Image recognition is not configured');
    err.status = 503;
    throw err;
  }
  const className = await recognizer.predict(imageBuffer);
  return { class_name: className };
}
