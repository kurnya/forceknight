const settings = require("../config/settings");

// Parse once at startup, then cache as a Set for O(1) lookups
const allowedGroupsSet = new Set(
  (settings.allowedGroups || "")
    .split(",")
    .map((groupId) => groupId.trim())
    .filter(Boolean)
);

function getAllowedGroups() {
  return [...allowedGroupsSet];
}

function isAllowedGroup(groupId) {
  if (!groupId) {
    return false;
  }

  return allowedGroupsSet.has(groupId);
}

module.exports = {
  getAllowedGroups,
  isAllowedGroup
};
