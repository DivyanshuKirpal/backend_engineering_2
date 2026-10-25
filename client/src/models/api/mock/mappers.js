// Records to response shapes (section 4, DTOs), as the server's mappers do:
// owner ids and internal fields come off before anything leaves the API.

export function userDto(u) {
  return {
    id: u.id, email: u.email, displayName: u.displayName, role: u.role, status: u.status,
    emailVerified: u.emailVerified, kycStatus: u.kycStatus,
    twoFactorEnabled: u.twoFactorEnabled, twoFactorEnabledAt: u.twoFactorEnabledAt,
    hasPassword: u.hasPassword, googleLinked: u.googleLinked, avatarUrl: u.avatarUrl,
    preferences: { ...u.preferences }, createdAt: u.createdAt,
  };
}

export function adminUserDto(u) {
  return { ...userDto(u), isBot: u.isBot, failedLoginCount: u.failedLoginCount, lastLoginAt: u.lastLoginAt };
}

export function sessionDto(s, currentId) {
  return { id: s.id, device: s.device, ip: s.ip, lastUsedAt: s.lastUsedAt, createdAt: s.createdAt, current: s.id === currentId };
}

export function ledgerDto(e) {
  return {
    id: e.id, asset: e.asset, type: e.type,
    deltaAvailable: e.deltaAvailable, deltaLocked: e.deltaLocked,
    availableAfter: e.availableAfter, lockedAfter: e.lockedAfter,
    refType: e.refType, refId: e.refId, time: e.time,
  };
}

export function fillDto(f) {
  return {
    id: f.id, orderId: f.orderId, market: f.market, side: f.side, role: f.role,
    price: f.price, quantity: f.quantity, quoteQuantity: f.quoteQuantity, fee: f.fee, feeAsset: f.feeAsset, time: f.time,
  };
}

export function transactionDto(t, { admin = false } = {}) {
  const dto = {
    id: t.id, type: t.type, method: t.method, asset: t.asset, amount: t.amount, fee: t.fee,
    receiveAmount: t.receiveAmount, fiatAmount: t.fiatAmount, fiatCurrency: t.fiatCurrency,
    address: t.address, txHash: t.txHash, status: t.status, rejectReason: t.rejectReason,
    createdAt: t.createdAt, reviewedAt: t.reviewedAt,
  };
  if (admin) Object.assign(dto, { userId: t.userId, userEmail: t.userEmail, userDisplayName: t.userDisplayName });
  return dto;
}

export function kycDto(k, { admin = false } = {}) {
  const dto = {
    id: k.id, status: k.status, fullName: k.fullName, dateOfBirth: k.dateOfBirth, country: k.country,
    documentType: k.documentType, documentNumberLast4: k.documentNumberLast4, rejectReason: k.rejectReason,
    createdAt: k.createdAt, reviewedAt: k.reviewedAt,
  };
  if (admin) {
    Object.assign(dto, {
      userId: k.userId, userEmail: k.userEmail, userDisplayName: k.userDisplayName,
      userCreatedAt: k.userCreatedAt, hasSelfie: k.hasSelfie,
    });
  }
  return dto;
}

export function notificationDto(n) {
  return { id: n.id, type: n.type, title: n.title, body: n.body, link: n.link, read: n.read, createdAt: n.createdAt };
}

export function auditDto(a) {
  return { id: a.id, actor: { ...a.actor }, action: a.action, targetType: a.targetType, targetId: a.targetId, metadata: { ...a.metadata }, ip: a.ip, createdAt: a.createdAt };
}
