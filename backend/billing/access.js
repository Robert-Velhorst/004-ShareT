function createGuards(getService, findShare) {
  const check = (req, res, next, userId, guest = false) => {
    const service = getService();
    if (!service.config.enabled) return next();
    if (!service.summary(userId).canUse) return res.status(402).json({ success: false,
      code: 'RESOURCE_BALANCE_REQUIRED', message: guest
        ? 'This shared link is paused. Please ask its owner to check their ShareT resource balance.'
        : 'Your resource balance is empty or on hold. Open Credits & usage to continue.' });
    req.resourceBilling = true;
    return next();
  };
  return {
    owner: (req, res, next) => {
      try { return check(req, res, next, req.user._id || req.user.id); }
      catch { return res.status(503).json({ message: 'Resource billing temporarily unavailable' }); }
    },
    guest: async (req, res, next) => {
      try {
        if (!getService().config.enabled) return next();
        const share = await findShare(req.params.shareId);
        if (!share) return res.status(404).json({ message: 'Share not found' });
        return check(req, res, next, share.userId, true);
      } catch { return res.status(503).json({ message: 'Shared link temporarily unavailable' }); }
    }
  };
}
const guards = createGuards(() => require('./runtime').getBilling(), shareId => require('../db/pouchdb').SharedLink.findByShareId(shareId));
function canUseResources(userId) {
  const service = require('./runtime').getBilling();
  return !service.config.enabled || service.summary(userId).canUse;
}
module.exports = { createGuards, canUseResources, ...guards };
