'use strict';

// MongoDB indexes are persistent database schema. Never recreate an index
// solely to change its options during normal app startup: doing so may remove
// a uniqueness guarantee or fail when legacy documents contain missing data.
function sameKeys(left, right) {
  const a = Object.entries(left || {});
  const b = Object.entries(right || {});
  return a.length === b.length && a.every(([key, direction], i) =>
    b[i][0] === key && b[i][1] === direction);
}

function assertRequiredConstraint(existing, options, collectionName) {
  if (options.unique && !existing.unique) {
    throw new Error(`[indexes] ${collectionName}.${existing.name} is not unique, but the application requires uniqueness. Review the data and index manually; no automatic index deletion was performed.`);
  }
}

async function createCompatibleIndex(collection, keys, options = {}, label = 'collection') {
  const name = options.name || Object.entries(keys).map(([field, direction]) => `${field}_${direction}`).join('_');
  const existing = await collection.indexes();
  const matching = existing.find((idx) => sameKeys(idx.key, keys));
  if (matching) {
    assertRequiredConstraint(matching, options, label);
    // Existing unique+sparse index is valid for username: every stored
    // username is still unique, and missing legacy usernames are tolerated.
    if (matching.name !== name || Boolean(matching.sparse) !== Boolean(options.sparse)) {
      console.info(`[indexes] Reusing existing ${label}.${matching.name} without changing historical index options`);
    }
    return matching.name;
  }
  const nameCollision = existing.find((idx) => idx.name === name);
  if (nameCollision) {
    throw new Error(`[indexes] ${label}.${name} already exists with different keys. Indexes were not deleted; inspect this collection's indexes before changing schema.`);
  }
  try {
    return await collection.createIndex(keys, options);
  } catch (error) {
    // Another server instance may have created the index during startup.
    if ([85, 86].includes(error?.code)) {
      const refreshed = await collection.indexes();
      const concurrent = refreshed.find((idx) => sameKeys(idx.key, keys));
      if (concurrent) {
        assertRequiredConstraint(concurrent, options, label);
        return concurrent.name;
      }
    }
    throw error;
  }
}

module.exports = { createCompatibleIndex, sameKeys };
