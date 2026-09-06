"use client";

import { useState } from "react";

type Setting = { key: string; value: string | number | null; updatedAt: string | number | null; updatedBy: string | number | null };

export function SettingsTable({ settings }: { settings: Setting[] }) {
  const [rows, setRows] = useState(settings);
  const [editing, setEditing] = useState<string | null>(null);

  async function edit(key: string, current: Setting["value"]): Promise<void> {
    const value = window.prompt(`New value for ${key}`, String(current ?? ""));
    if (value === null) return;
    setEditing(key);
    const response = await fetch("/api/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ key, value }) });
    setEditing(null);
    if (!response.ok) return;
    const updated = await response.json() as { key: string; value: string; updatedBy: string };
    setRows((currentRows) => currentRows.map((row) => row.key === key ? { ...row, value: updated.value, updatedBy: updated.updatedBy } : row));
  }

  return <div className="data-table-wrap"><table className="data-table settings-table"><thead><tr><th>ID</th><th>Value</th><th>Author</th><th>Action</th></tr></thead><tbody>{rows.map((row) => <tr key={row.key}><td className="mono-cell">{row.key}</td><td>{String(row.value ?? "")}</td><td className="mono-cell">{String(row.updatedBy ?? "DEFAULT")}</td><td><button className="table-action" type="button" onClick={() => edit(row.key, row.value)} disabled={editing === row.key}>{editing === row.key ? "SAVING" : "EDIT"}</button></td></tr>)}</tbody></table></div>;
}