const validator = require('validator');

function validateEmail(email) {
  return validator.isEmail(email);
}

function validateCommand(content) {
  const prefix = '!mail ';
  if (!content.startsWith(prefix)) return null;
  const rest = content.slice(prefix.length).trim();
  const separatorIndex = rest.indexOf(' | ');
  if (separatorIndex === -1) return null;
  const emailPart = rest.slice(0, separatorIndex).trim();
  const afterEmail = rest.slice(separatorIndex + 3).trim();
  const firstSpace = afterEmail.indexOf(' ');
  let subject, message;
  if (firstSpace === -1) {
    subject = afterEmail;
    message = '';
  } else {
    subject = afterEmail.slice(0, firstSpace).trim();
    message = afterEmail.slice(firstSpace + 1).trim();
  }
  if (!validateEmail(emailPart)) return null;
  if (!subject || !message) return null;
  return { email: emailPart, subject, message };
}

function sanitizeInput(str) {
  return str.replace(/[^\w\s@.|-]/gi, '').substring(0, 2000);
}

module.exports = { validateEmail, validateCommand, sanitizeInput };