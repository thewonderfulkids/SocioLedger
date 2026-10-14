// Pure authentication/identity helpers extracted as a Batch 12 architecture boundary.
// Runtime migration from App.jsx is deliberately staged separately so existing login
// behavior remains unchanged until regression checks have validated this module.

export function normalizePhone(phone = "") {
  return String(phone).replace(/\D/g, "").slice(-10);
}

export function phoneToEmail(phone = "") {
  return `${normalizePhone(phone)}@socioledger.local`;
}

export function getLoginEmailCandidates(phone = "") {
  const normalizedPhone = normalizePhone(phone);
  if (normalizedPhone.length !== 10) return [];

  return [
    `${normalizedPhone}@socioledger.local`,
    `${normalizedPhone}@socioledger.com`,
    `${normalizedPhone}@socioledger.in`,
  ];
}

export function findLegacyUserProfile(usersValue, authUser, profileHint = null) {
  if (!usersValue || !authUser) return null;

  const authEmail = String(authUser.email || "").trim().toLowerCase();
  const hintedEmail = String(
    profileHint?.email || profileHint?.loginEmail || profileHint?.authEmail || ""
  ).trim().toLowerCase();

  const authPhone = normalizePhone(
    profileHint?.phone ||
      profileHint?.mobile ||
      profileHint?.mobileNumber ||
      authUser.phoneNumber ||
      authEmail.split("@")[0]
  );

  for (const [key, profileValue] of Object.entries(usersValue)) {
    if (key === authUser.uid) continue;

    const profile = profileValue || {};
    const profileUid = String(profile.uid || profile.authUid || "").trim();
    const profileEmail = String(
      profile.email || profile.loginEmail || profile.authEmail || ""
    ).trim().toLowerCase();
    const profilePhone = normalizePhone(
      profile.phone || profile.mobile || profile.mobileNumber || ""
    );
    const keyPhone = normalizePhone(key);
    const keyMatchesPhone =
      key === `resident_${authPhone}` ||
      key === `manager_${authPhone}` ||
      (!!authPhone && keyPhone === authPhone);

    if (
      profileUid === authUser.uid ||
      (!!authEmail && profileEmail === authEmail) ||
      (!!hintedEmail && profileEmail === hintedEmail) ||
      (!!authPhone && profilePhone === authPhone) ||
      keyMatchesPhone
    ) {
      return { key, profile };
    }
  }

  return null;
}

export function mergeBooleanMaps(normalizeBooleanMapIds, ...values) {
  const merged = {};
  values.forEach((value) => {
    normalizeBooleanMapIds(value).forEach((id) => {
      merged[String(id)] = true;
    });
  });
  return merged;
}

export function mergeFlatIdMaps(normalizeBooleanMapIds, ...values) {
  const merged = {};
  values.forEach((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    Object.entries(value).forEach(([societyId, flatIds]) => {
      merged[societyId] = {
        ...(merged[societyId] || {}),
        ...mergeBooleanMaps(normalizeBooleanMapIds, flatIds),
      };
    });
  });
  return merged;
}

export function mergeUserProfiles(normalizeBooleanMapIds, legacyProfile, directProfile) {
  const legacy = legacyProfile || {};
  const direct = directProfile || {};

  return {
    ...legacy,
    ...direct,
    societyIds: mergeBooleanMaps(
      normalizeBooleanMapIds,
      legacy.societyIds,
      legacy.societyId,
      legacy.assignedSocietyId,
      legacy.assignedSocieties,
      direct.societyIds,
      direct.societyId,
      direct.assignedSocietyId,
      direct.assignedSocieties
    ),
    flatIds: mergeFlatIdMaps(normalizeBooleanMapIds, legacy.flatIds, direct.flatIds),
    flatId: direct.flatId || legacy.flatId || "",
  };
}
