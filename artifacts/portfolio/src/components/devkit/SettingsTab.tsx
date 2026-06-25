import React, { useCallback, useEffect, useState } from "react";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
const apiUrl = (path: string) => `${API_BASE}${path}`;

// ─── Types ────────────────────────────────────────────────────────────────────
interface FooterLinkData { name: string; hoverText?: string; url: string; icon: string }
interface ProjectUrlData { text: string; url?: string; disabled?: boolean }
interface ProjectData { title: string; date: string; subtext: string; urls: ProjectUrlData[] }
interface TimelinePointData { year: string; title: string; subtitle?: string; description?: string; position: "left" | "right" }

type Section = "footer_links" | "projects" | "work_timeline" | "education_timeline" | "site_version";

// ─── Shared UI helpers ────────────────────────────────────────────────────────
const inputCls = "w-full bg-black border border-neutral-800 text-white px-2.5 py-2 font-vercetti text-xs focus:outline-none focus:border-neutral-500 transition-colors rounded-sm";
const labelCls = "font-vercetti text-[9px] uppercase tracking-widest text-neutral-600 mb-1 block";
const btnCls = "border border-neutral-800 text-neutral-400 px-2.5 py-1.5 font-vercetti text-[10px] uppercase tracking-widest hover:bg-white hover:text-black transition-colors rounded-sm";
const btnDangerCls = "border border-red-900/80 text-red-500 px-2.5 py-1.5 font-vercetti text-[10px] uppercase tracking-widest hover:bg-red-700 hover:text-white hover:border-red-700 transition-colors rounded-sm";
const btnPrimaryCls = "border border-neutral-300 text-white px-3 py-1.5 font-vercetti text-[10px] uppercase tracking-widest hover:bg-white hover:text-black transition-colors rounded-sm";
const cardCls = "bg-neutral-950 border border-neutral-800 rounded-sm p-4 space-y-3";

function SectionHeader({ title, onSave, saving, onReset }: { title: string; onSave: () => void; saving: boolean; onReset?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="font-soria text-lg text-white">{title}</h2>
      <div className="flex items-center gap-1.5">
        {onReset && <button onClick={onReset} className={btnDangerCls}>Reset</button>}
        <button onClick={onSave} disabled={saving} className={btnPrimaryCls}>{saving ? "Saving…" : "Save"}</button>
      </div>
    </div>
  );
}

// ─── Footer Links Editor ──────────────────────────────────────────────────────
function FooterLinksEditor() {
  const [items, setItems] = useState<FooterLinkData[]>([]);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(apiUrl("/api/devkit/settings"), { credentials: "include" })
      .then(r => r.json())
      .then((d: Record<string, { data: unknown }>) => {
        if (d.footer_links?.data) setItems(d.footer_links.data as FooterLinkData[]);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const update = (i: number, field: keyof FooterLinkData, val: string) => {
    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: val } as FooterLinkData : it));
  };
  const add = () => setItems(prev => [...prev, { name: "New Link", hoverText: "", url: "https://", icon: "icons/email.svg" }]);
  const remove = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) => {
    setItems(prev => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const copy = [...prev];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch(apiUrl("/api/devkit/settings/footer_links"), {
        method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ data: items }),
      });
      if (!r.ok) alert("Save failed");
    } catch { alert("Network error"); } finally { setSaving(false); }
  };

  const reset = async () => {
    if (!confirm("Reset footer links to hardcoded defaults?")) return;
    try {
      await fetch(apiUrl("/api/devkit/settings/footer_links"), { method: "DELETE", credentials: "include" });
      setItems([]);
    } catch { alert("Reset failed"); }
  };

  if (!loaded) return <div className={cardCls}>Loading…</div>;

  return (
    <div className={cardCls}>
      <SectionHeader title="Footer Links" onSave={save} saving={saving} onReset={reset} />
      {items.length === 0 && <p className="font-vercetti text-[10px] text-neutral-600">No overrides — using hardcoded defaults. Add a link to override.</p>}
      {items.map((item, i) => (
        <div key={i} className="border border-neutral-900 rounded-sm p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-vercetti text-[9px] uppercase tracking-widest text-neutral-600">Link {i + 1}</span>
            <div className="flex gap-1">
              <button onClick={() => move(i, -1)} className={btnCls}>↑</button>
              <button onClick={() => move(i, 1)} className={btnCls}>↓</button>
              <button onClick={() => remove(i)} className={btnDangerCls}>✕</button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className={labelCls}>Name</label><input className={inputCls} value={item.name} onChange={e => update(i, "name", e.target.value)} /></div>
            <div><label className={labelCls}>Hover Text</label><input className={inputCls} value={item.hoverText ?? ""} onChange={e => update(i, "hoverText", e.target.value)} /></div>
            <div><label className={labelCls}>URL</label><input className={inputCls} value={item.url} onChange={e => update(i, "url", e.target.value)} /></div>
            <div><label className={labelCls}>Icon Path</label><input className={inputCls} value={item.icon} onChange={e => update(i, "icon", e.target.value)} /></div>
          </div>
        </div>
      ))}
      <button onClick={add} className={btnCls}>+ Add Link</button>
    </div>
  );
}

// ─── Projects Editor ──────────────────────────────────────────────────────────
function ProjectsEditor() {
  const [items, setItems] = useState<ProjectData[]>([]);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(apiUrl("/api/devkit/settings"), { credentials: "include" })
      .then(r => r.json())
      .then((d: Record<string, { data: unknown }>) => {
        if (d.projects?.data) setItems(d.projects.data as ProjectData[]);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const update = (i: number, field: keyof ProjectData, val: string) => {
    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: val } as ProjectData : it));
  };
  const updateUrl = (pi: number, ui: number, field: keyof ProjectUrlData, val: string | boolean) => {
    setItems(prev => prev.map((p, idx) => {
      if (idx !== pi) return p;
      const urls = p.urls.map((u, j) => j === ui ? { ...u, [field]: val } as ProjectUrlData : u);
      return { ...p, urls };
    }));
  };
  const addUrl = (pi: number) => {
    setItems(prev => prev.map((p, idx) => idx === pi ? { ...p, urls: [...p.urls, { text: "LINK ↗", url: "https://" }] } : p));
  };
  const removeUrl = (pi: number, ui: number) => {
    setItems(prev => prev.map((p, idx) => idx === pi ? { ...p, urls: p.urls.filter((_, j) => j !== ui) } : p));
  };
  const add = () => setItems(prev => [...prev, { title: "New Project", date: "2026", subtext: "", urls: [{ text: "VIEW ↗", disabled: true }] }]);
  const remove = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) => {
    setItems(prev => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const copy = [...prev];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch(apiUrl("/api/devkit/settings/projects"), {
        method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ data: items }),
      });
      if (!r.ok) alert("Save failed");
    } catch { alert("Network error"); } finally { setSaving(false); }
  };

  const reset = async () => {
    if (!confirm("Reset projects to hardcoded defaults?")) return;
    try {
      await fetch(apiUrl("/api/devkit/settings/projects"), { method: "DELETE", credentials: "include" });
      setItems([]);
    } catch { alert("Reset failed"); }
  };

  if (!loaded) return <div className={cardCls}>Loading…</div>;

  return (
    <div className={cardCls}>
      <SectionHeader title="Projects" onSave={save} saving={saving} onReset={reset} />
      {items.length === 0 && <p className="font-vercetti text-[10px] text-neutral-600">No overrides — using hardcoded defaults. Add a project to override.</p>}
      {items.map((item, i) => (
        <div key={i} className="border border-neutral-900 rounded-sm p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-vercetti text-[9px] uppercase tracking-widest text-neutral-600">Project {i + 1}</span>
            <div className="flex gap-1">
              <button onClick={() => move(i, -1)} className={btnCls}>↑</button>
              <button onClick={() => move(i, 1)} className={btnCls}>↓</button>
              <button onClick={() => remove(i)} className={btnDangerCls}>✕</button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className={labelCls}>Title</label><input className={inputCls} value={item.title} onChange={e => update(i, "title", e.target.value)} /></div>
            <div><label className={labelCls}>Date</label><input className={inputCls} value={item.date} onChange={e => update(i, "date", e.target.value)} /></div>
          </div>
          <div><label className={labelCls}>Subtext</label><textarea className={inputCls} rows={3} value={item.subtext} onChange={e => update(i, "subtext", e.target.value)} /></div>
          <div className="space-y-1.5">
            <label className={labelCls}>Links</label>
            {item.urls.map((u, ui) => (
              <div key={ui} className="flex items-center gap-2">
                <input className={`${inputCls} w-24`} placeholder="Label" value={u.text} onChange={e => updateUrl(i, ui, "text", e.target.value)} />
                <input className={inputCls} placeholder="URL (leave empty for disabled)" value={u.url ?? ""} onChange={e => updateUrl(i, ui, "url", e.target.value)} />
                <label className="flex items-center gap-1 font-vercetti text-[10px] text-neutral-500 shrink-0">
                  <input type="checkbox" checked={u.disabled ?? false} onChange={e => updateUrl(i, ui, "disabled", e.target.checked)} /> Disabled
                </label>
                <button onClick={() => removeUrl(i, ui)} className={`${btnDangerCls} shrink-0`}>✕</button>
              </div>
            ))}
            <button onClick={() => addUrl(i)} className={btnCls}>+ Add Link</button>
          </div>
        </div>
      ))}
      <button onClick={add} className={btnCls}>+ Add Project</button>
    </div>
  );
}

// ─── Timeline Editor ──────────────────────────────────────────────────────────
function TimelineEditor({ section, title }: { section: Section; title: string }) {
  const [items, setItems] = useState<TimelinePointData[]>([]);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(apiUrl("/api/devkit/settings"), { credentials: "include" })
      .then(r => r.json())
      .then((d: Record<string, { data: unknown }>) => {
        if (d[section]?.data) setItems(d[section].data as TimelinePointData[]);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [section]);

  const update = (i: number, field: keyof TimelinePointData, val: string) => {
    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: val } as TimelinePointData : it));
  };
  const add = () => setItems(prev => [...prev, { year: "2026", title: "New Entry", subtitle: "", position: prev.length % 2 === 0 ? "right" : "left" }]);
  const remove = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) => {
    setItems(prev => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const copy = [...prev];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch(apiUrl(`/api/devkit/settings/${section}`), {
        method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ data: items }),
      });
      if (!r.ok) alert("Save failed");
    } catch { alert("Network error"); } finally { setSaving(false); }
  };

  const reset = async () => {
    if (!confirm(`Reset ${title} to hardcoded defaults?`)) return;
    try {
      await fetch(apiUrl(`/api/devkit/settings/${section}`), { method: "DELETE", credentials: "include" });
      setItems([]);
    } catch { alert("Reset failed"); }
  };

  if (!loaded) return <div className={cardCls}>Loading…</div>;

  return (
    <div className={cardCls}>
      <SectionHeader title={title} onSave={save} saving={saving} onReset={reset} />
      {items.length === 0 && <p className="font-vercetti text-[10px] text-neutral-600">No overrides — using hardcoded defaults. Add an entry to override.</p>}
      {items.map((item, i) => (
        <div key={i} className="border border-neutral-900 rounded-sm p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-vercetti text-[9px] uppercase tracking-widest text-neutral-600">Entry {i + 1}</span>
            <div className="flex gap-1">
              <button onClick={() => move(i, -1)} className={btnCls}>↑</button>
              <button onClick={() => move(i, 1)} className={btnCls}>↓</button>
              <button onClick={() => remove(i)} className={btnDangerCls}>✕</button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div><label className={labelCls}>Year</label><input className={inputCls} value={item.year} onChange={e => update(i, "year", e.target.value)} /></div>
            <div><label className={labelCls}>Position</label>
              <select className={inputCls} value={item.position} onChange={e => update(i, "position", e.target.value)}>
                <option value="left">Left</option>
                <option value="right">Right</option>
              </select>
            </div>
            <div></div>
          </div>
          <div><label className={labelCls}>Title</label><input className={inputCls} value={item.title} onChange={e => update(i, "title", e.target.value)} /></div>
          <div><label className={labelCls}>Subtitle</label><input className={inputCls} value={item.subtitle ?? ""} onChange={e => update(i, "subtitle", e.target.value)} /></div>
          <div><label className={labelCls}>Description (optional)</label><textarea className={inputCls} rows={2} value={item.description ?? ""} onChange={e => update(i, "description", e.target.value)} /></div>
        </div>
      ))}
      <button onClick={add} className={btnCls}>+ Add Entry</button>
    </div>
  );
}

// ─── Site Version Editor ──────────────────────────────────────────────────────
function SiteVersionEditor() {
  const [version, setVersion] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(apiUrl("/api/devkit/settings"), { credentials: "include" })
      .then(r => r.json())
      .then((d: Record<string, { data: unknown }>) => {
        if (d.site_version?.data) setVersion(d.site_version.data as string);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch(apiUrl("/api/devkit/settings/site_version"), {
        method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ data: version }),
      });
      if (!r.ok) alert("Save failed");
    } catch { alert("Network error"); } finally { setSaving(false); }
  };

  const reset = async () => {
    if (!confirm("Reset version to package.json default?")) return;
    try {
      await fetch(apiUrl("/api/devkit/settings/site_version"), { method: "DELETE", credentials: "include" });
      setVersion("");
    } catch { alert("Reset failed"); }
  };

  if (!loaded) return <div className={cardCls}>Loading…</div>;

  return (
    <div className={cardCls}>
      <SectionHeader title="Site Version" onSave={save} saving={saving} onReset={reset} />
      {version === "" && <p className="font-vercetti text-[10px] text-neutral-600">No override — using package.json version. Enter a version to override.</p>}
      <div>
        <label className={labelCls}>Version (e.g. 1.14)</label>
        <input className={inputCls} value={version} onChange={e => setVersion(e.target.value)} placeholder="e.g. 1.14" />
      </div>
    </div>
  );
}

// ─── Main Settings Tab ────────────────────────────────────────────────────────
const SettingsTab = () => {
  return (
    <div className="space-y-5">
      <div className="bg-neutral-950 border border-neutral-800 rounded-sm p-4">
        <p className="font-vercetti text-[10px] text-neutral-500 leading-relaxed">
          Manage site content from the database. Changes take effect on the next page load.
          If a section has no override, the hardcoded defaults are used.
        </p>
      </div>
      <SiteVersionEditor />
      <FooterLinksEditor />
      <ProjectsEditor />
      <TimelineEditor section="work_timeline" title="Work Timeline" />
      <TimelineEditor section="education_timeline" title="Education Timeline" />
    </div>
  );
};

export default SettingsTab;
