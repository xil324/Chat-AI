import { Router } from 'express';
import multer from 'multer';
import { auth } from '../middleware/auth.js';
import { handleRecognize } from '../controllers/imageController.js';

const upload = multer({ storage: multer.memoryStorage() });
const router = Router();

router.use(auth);
router.post('/recognize', upload.single('image'), handleRecognize);

export default router;
