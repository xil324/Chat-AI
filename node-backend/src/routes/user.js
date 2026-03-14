import { Router } from 'express';
import { handleLogin, handleRegister, handleCaptcha } from '../controllers/userController.js';

const router = Router();

router.post('/login', handleLogin);
router.post('/register', handleRegister);
router.post('/captcha', handleCaptcha);

export default router;
