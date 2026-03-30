export function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export type MockModuleMetrics = {
  connections: number;
  modules: number;
  orgs: number;
  users: number;
  validators: number;
};

/** Deterministic pretend metrics; `Modulr.Core` gets flagship-style numbers. */
export function getMockMetrics(moduleKey: string): MockModuleMetrics {
  const key = moduleKey.trim() || "Modulr.Core";
  if (key.toLowerCase() === "modulr.core") {
    return {
      connections: 847,
      modules: 12408,
      orgs: 892,
      users: 45120,
      validators: 156,
    };
  }
  const h = hashString(key);
  return {
    connections: 210 + (h % 920),
    modules: 3200 + (h % 9800),
    orgs: 48 + (h % 510),
    users: 1800 + (h % 42000),
    validators: 18 + (h % 134),
  };
}
