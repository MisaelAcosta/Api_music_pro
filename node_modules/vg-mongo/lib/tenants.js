function getTenantPattern(tenant) {
  if (!tenant) return null;
  return `${tenant.toLowerCase().split(' ').join('')}`;
}

module.exports = getTenantPattern;
