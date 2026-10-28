import { createRemoteJWKSet, errors, jwtVerify } from 'jose';

const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'), { timeoutDuration: 5000 });

export class GoogleAuthError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

const unauthorized = () => new GoogleAuthError(401, 'invalid_google_token', 'Tu acceso con Google no es válido o ya venció. Vuelve a iniciar sesión.');

export async function verifyGoogleToken(token, clientId, { keys = googleKeys, now = new Date() } = {}) {
  if (typeof token !== 'string' || token.length > 8192 || token.split('.').length !== 3) throw unauthorized();
  if (!clientId) throw new GoogleAuthError(503, 'auth_unavailable', 'El acceso con Google no está configurado.');
  try {
    const { payload } = await jwtVerify(token, keys, {
      algorithms: ['RS256'],
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: clientId,
      requiredClaims: ['sub', 'iat', 'exp', 'email', 'email_verified'],
      maxTokenAge: '2h',
      currentDate: now,
    });
    if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 255
      || typeof payload.email !== 'string' || !payload.email || payload.email.length > 320
      || payload.email_verified !== true
      || (payload.azp !== undefined && payload.azp !== clientId)
      || (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== clientId)) throw unauthorized();
    return {
      user: { id: payload.sub, email: payload.email, name: typeof payload.name === 'string' ? payload.name.slice(0, 160) : payload.email },
      expiresAt: payload.exp * 1000,
    };
  } catch (error) {
    if (error instanceof GoogleAuthError) throw error;
    if (error instanceof errors.JOSEError && !(error instanceof errors.JWKSTimeout)) throw unauthorized();
    throw new GoogleAuthError(503, 'auth_unavailable', 'No pudimos verificar tu cuenta con Google. Vuelve a intentarlo.');
  }
}

export async function authenticateGoogleRequest(request, clientId, options) {
  const match = /^Bearer ([A-Za-z0-9_.-]{1,8192})$/.exec(request.headers.get('Authorization') ?? '');
  if (!match) throw unauthorized();
  return verifyGoogleToken(match[1], clientId, options);
}
