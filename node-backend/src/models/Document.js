import mongoose from 'mongoose';

const DocumentSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    user_name: { type: String, required: true, index: true },
    filename: { type: String, required: true },
    file_path: { type: String, required: true },
    title: { type: String, default: '' },
    source: { type: String, default: null },
    source_url: { type: String, default: null },
    source_type: { type: String, default: 'upload' },
    source_last_modified: { type: Date, default: null },
    source_etag: { type: String, default: null },
    last_synced_at: { type: Date, default: null },
    category: { type: String, default: null },
    language: { type: String, default: null },
    content_hash: { type: String, index: true, default: null },
    ingestion_status: {
      type: String,
      enum: ['pending', 'running', 'failed', 'done'],
      default: 'pending',
      index: true,
    },
    ingestion_error: { type: String, default: null },
    ingestion_attempts: { type: Number, default: 0 },
    last_enqueued_at: { type: Date, default: null },
    last_started_at: { type: Date, default: null },
    last_finished_at: { type: Date, default: null },
    ingested_at: { type: Date, default: null },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  { versionKey: false },
);

DocumentSchema.index({ user_name: 1, content_hash: 1 });
DocumentSchema.index({ user_name: 1, source_url: 1 });

export default mongoose.models.Document || mongoose.model('Document', DocumentSchema);
