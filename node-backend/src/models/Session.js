import mongoose from 'mongoose';

const SessionSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    user_name: { type: String, required: true, index: true },
    title: { type: String, required: true },
    attached_document_id: { type: String, default: null },
    created_at: { type: Date, default: Date.now, index: true },
    updated_at: { type: Date, default: Date.now },
  },
  { versionKey: false },
);

export default mongoose.models.Session || mongoose.model('Session', SessionSchema);
