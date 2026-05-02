import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema(
  {
    _id: { type: mongoose.Schema.Types.Mixed, required: true },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, index: true },
    username: { type: String, required: true, unique: true, index: true },
    password: { type: String, required: true },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  { versionKey: false },
);

export default mongoose.models.User || mongoose.model('User', UserSchema);
