export function buildClickHouseUrl(baseUrl, user, password, database) {
  const base = baseUrl.replace(/\/$/, "");
  return `${base}/?user=${encodeURIComponent(user)}&password=${encodeURIComponent(password)}&database=${encodeURIComponent(database)}`;
}

export async function runSQL(sql, config, fetchFn = globalThis.fetch) {
  const url = buildClickHouseUrl(config.url, config.user, config.password, config.database);
  const resp = await fetchFn(url, { method: "POST", body: sql });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`ClickHouse error (${resp.status}): ${body}`);
  }
  return resp.text();
}
