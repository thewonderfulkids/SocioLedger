// Batch 12 architecture boundary.
// These pure helpers mirror the existing access model without changing runtime behavior yet.
// They are intentionally dependency-free so they can be regression-tested before App.jsx
// is migrated to import them.

export const roles = {
  SUPER_ADMIN: "super_admin",
  MANAGER: "manager",
  RESIDENT: "resident",
};

export function normalizeRole(role = "") {
  const value = String(role || "").trim().toLowerCase().replace(/[\s-]+/g, "_");

  if (["super_admin", "superadmin", "admin"].includes(value)) return roles.SUPER_ADMIN;
  if (["manager", "building_manager", "buildingmanager"].includes(value)) return roles.MANAGER;
  if (["resident", "flat_owner", "flatowner"].includes(value)) return roles.RESIDENT;

  return value;
}

export function normalizeBooleanMapIds(value) {
  if (!value) return [];

  if (Array.isArray(value)) return value.filter(Boolean).map(String);

  if (typeof value === "object") {
    return Object.keys(value).filter(
      (id) => value[id] === true || value[id] === "true" || value[id] === 1
    );
  }

  return [String(value)].filter(Boolean);
}

export function getUserSocietyIds(user) {
  const ids = new Set();

  [
    user?.societyIds,
    user?.societyId,
    user?.assignedSocietyId,
    user?.assignedSocieties,
    user?.societies,
    user?.buildingId,
  ].forEach((value) => {
    normalizeBooleanMapIds(value).forEach((id) => ids.add(String(id)));
  });

  if (user?.flatIds && typeof user.flatIds === "object" && !Array.isArray(user.flatIds)) {
    Object.keys(user.flatIds).forEach((societyId) => ids.add(String(societyId)));
  }

  return Array.from(ids);
}

export function canAccessSociety(user, societyId) {
  if (!user || !societyId) return false;
  if (normalizeRole(user.role) === roles.SUPER_ADMIN) return true;
  return getUserSocietyIds(user).includes(String(societyId));
}

export function getUserFlatIds(user, societyId) {
  const ids = new Set();

  normalizeBooleanMapIds(user?.flatIds?.[societyId]).forEach((id) => ids.add(id));
  normalizeBooleanMapIds(user?.flatIds).forEach((id) => ids.add(id));

  if (user?.flatId) ids.add(String(user.flatId));
  return Array.from(ids);
}
