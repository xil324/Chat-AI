import { Router } from 'express';
import multer from 'multer';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { auth } from '../middleware/auth.js';
import {
  handleUpload,
  handleList,
  handleDelete,
  handleAttach,
  handleDetach,
} from '../controllers/documentController.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// __dirname = node-backend/src/routes/ → ../../ = node-backend/ → ../../uploads/tmp/ = node-backend/uploads/tmp/
const upload = multer({
  dest: join(__dirname, '../../uploads/tmp/'),
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are allowed'));
  },
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB max
});

const router = Router();
router.use(auth);

router.post('/upload', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, handleUpload);
router.get('/list', handleList);
router.delete('/:id', handleDelete);
router.post('/attach', handleAttach);
router.post('/detach', handleDetach);

export default router;
