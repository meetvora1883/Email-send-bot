module.exports = function ensureAuth(req, res, next) {
  if (req.session && req.session.user === 'patel') {
    return next();
  }
  res.redirect('/login');
};