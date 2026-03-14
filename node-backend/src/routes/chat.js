import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import {
  handleGetSessions,
  handleSendNewSession,
  handleSendMessage,
  handleGetHistory,
} from '../controllers/chatController.js';

const router = Router();

router.use(auth);

router.get('/sessions', handleGetSessions);
router.post('/send-new-session', handleSendNewSession);
router.post('/send', handleSendMessage);
router.post('/history', handleGetHistory);

export default router;
