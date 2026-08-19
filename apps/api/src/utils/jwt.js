const jwt = require('jsonwebtoken');

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not set');
  }
  return secret;
}

function signToken({ user_id, email, is_admin = false }) {
  return jwt.sign(
    { user_id, email, is_admin: !!is_admin },
    getJwtSecret(),
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function verifyToken(token) {
  return jwt.verify(token, getJwtSecret());
}

module.exports = {
  signToken,
  verifyToken
};
