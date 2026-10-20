const PARTICIPANT_SCHEMA_VERSION = 1;
const passwordGrants = new Map();

export function participantStorageKey(shareId) {
  return `shareT_participant_${shareId}`;
}

export function passwordGrantStorageKey(shareId) {
  return `shareT_password_grant_${shareId}`;
}

export function readShareParticipant(shareId) {
  try {
    const raw = localStorage.getItem(participantStorageKey(shareId));
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (
      value?.version !== PARTICIPANT_SCHEMA_VERSION ||
      !value?.participantToken ||
      !value?.participant?.email ||
      !value?.participant?.name
    ) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

export function writeShareParticipant(shareId, participantToken, participant) {
  const value = {
    version: PARTICIPANT_SCHEMA_VERSION,
    participantToken,
    participant: {
      name: participant.name,
      email: participant.email,
      notificationEnabled: participant.notificationEnabled !== false,
      verifiedAt: participant.verifiedAt,
      sessionExpiresAt: participant.sessionExpiresAt || null
    }
  };
  localStorage.setItem(participantStorageKey(shareId), JSON.stringify(value));
  return value;
}

export function clearShareParticipant(shareId) {
  localStorage.removeItem(participantStorageKey(shareId));
}

export function readSharePasswordGrant(shareId) {
  return passwordGrants.get(passwordGrantStorageKey(shareId)) || '';
}

export function writeSharePasswordGrant(shareId, token) {
  const key = passwordGrantStorageKey(shareId);
  if (token) passwordGrants.set(key, token);
  else passwordGrants.delete(key);
  return token || '';
}

export function clearSharePasswordGrant(shareId) {
  passwordGrants.delete(passwordGrantStorageKey(shareId));
}

export function readShareAccess(shareId) {
  return {
    participantToken: readShareParticipant(shareId)?.participantToken || '',
    passwordToken: readSharePasswordGrant(shareId)
  };
}
