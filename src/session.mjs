// QR pairing stores the authenticated device in creds.me. The SDK's
// registered flag can remain false after a successful QR login.
export function hasLinkedCredentials(creds) {
  return typeof creds?.me?.id === 'string' && creds.me.id.trim().length > 0;
}
