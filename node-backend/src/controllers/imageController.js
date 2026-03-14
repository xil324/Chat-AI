import { recognizeImage } from '../services/imageService.js';

export async function handleRecognize(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: 'Image file is required' });
  }
  try {
    const result = await recognizeImage(req.file.buffer);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
}
