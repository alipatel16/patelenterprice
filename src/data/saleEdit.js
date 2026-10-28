// Reject changes made after the snapshot used to build the invoice edit.
export const saveSaleEdit = (mutate, ref, snapshot, patch) => mutate(ref, current => {
  if (current._writeRevision !== snapshot._writeRevision) {
    throw new Error('This sale changed while you were editing. Reload it and try again.');
  }
  return patch;
});
