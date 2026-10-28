import { getKnownDocument } from '../data/query';

// Snapshot-shaped bridge for existing edit/print views. Writes requesting an
// authoritative source pass ttlMs: 0, bypassing both cache and in-flight reuse.
export async function getKnownSnapshot(reference, options) {
  const data = await getKnownDocument(reference.firestore, reference.parent.id, reference.id, options);
  return { id: reference.id, exists: () => data !== null, data: () => data || undefined };
}
