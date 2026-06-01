import mongoose, { Schema, Document } from 'mongoose';

export interface ILiveTrackingCache extends Document {
  vehicles: any[];
  fetchedAt: Date;
  source: 'trakzee' | 'cache';
}

const liveTrackingCacheSchema = new Schema<ILiveTrackingCache>(
  {
    vehicles: { type: Schema.Types.Mixed, required: true, default: [] },
    fetchedAt: { type: Date, required: true, default: Date.now },
    source: { type: String, enum: ['trakzee', 'cache'], default: 'trakzee' },
  },
  { timestamps: true }
);

// TTL index: auto-delete docs after 15 minutes (900 seconds)
liveTrackingCacheSchema.index({ createdAt: 1 }, { expireAfterSeconds: 900 });

export const LiveTrackingCache = mongoose.model<ILiveTrackingCache>(
  'LiveTrackingCache',
  liveTrackingCacheSchema
);
