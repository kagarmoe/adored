// Single source of truth for the pool grouping/moving cap — imported by both
// ItemService (server enforcement) and the pool UI (client-side visibility of
// the same cap). Never duplicate the number or its message text; a drift
// between the two would show the wrong cap before the server ever gets a say.
export const MAX_GROUP_PHOTOS = 50;

export const POOL_CAP_MESSAGE = `You can group up to ${MAX_GROUP_PHOTOS} photos at once.`;
