import mongoose from 'mongoose';

const MessageSchema = new mongoose.Schema(
  {
    session_id: { type: String, required: true, index: true },
    user_name: { type: String, required: true, index: true },
    content: { type: String, required: true },
    is_user: { type: Boolean, required: true },
    citations: { type: Array, default: [] },
    rounds: { type: Number, default: null },
    created_at: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false },
);

export default mongoose.models.Message || mongoose.model('Message', MessageSchema);
