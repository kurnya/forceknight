const settings = require("../config/settings");

function getAllowedGroups() {
  return settings.allowedGroups
    .split(",")
    .map((groupId) => groupId.trim())
    .filter(Boolean);
}

function isAllowedGroup(groupId) {
  if (!groupId) {
    return false;
  }

  return getAllowedGroups().includes(groupId);
}

module.exports = {
  getAllowedGroups,
  isAllowedGroup
};
