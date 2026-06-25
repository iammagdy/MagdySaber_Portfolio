import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSettingsStore } from "../../stores/settingsStore";
import { FOOTER_LINKS, PROJECTS, WORK_TIMELINE, EDUCATION_TIMELINE } from "../../constants";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
const apiUrl = (path: string) => `${API_BASE}${path}`;

// ─── Types ────────────────────────────────────────────────────────────────────
interface FooterLinkData { name: string; hoverText?: string; url: string; icon: string }
interface ProjectUrlData { text: string; url?: string; disabled?: boolean }
interface ProjectData { title: string; date: string; subtext: string; urls: ProjectUrlData[] }
interface TimelinePointData { year: string; title: string; subtitle?: string; description?: string; position: "left" | "right" }

type SectionKey = "footer_links" | "projects" | "work_timeline" | "education_timeline" | "site_version";

// Convert hardcoded constants to editable format (strip THREE.Vector3 etc.)
const defaultFooterLinks: FooterLinkData[] = FOOTER_LINKS.map(f => ({ ...f }));
const defaultProjects: ProjectData[] = PROJECTS.map(p => ({
  title: p.title, date: p.date, subtext: p.subtext,
  urls: (p.urls ?? []).map(u => ({ ...u })),
}));
const defaultWorkTimeline: TimelinePointData[] = WORK_TIMELINE.map(t => ({
  year: t.year, title: t.title, subtitle: t.subtitle, description: t.description, position: t.position,
}));
const defaultEducationTimeline: TimelinePointData[] = EDUCATION_TIMELINE.map(t => ({
  year: t.year, title: t.title, subtitle: t.subtitle, description: t.description, position: t.position,
}));

// ─── Shared UI helpers ────────────────────────────────────────────────────────
const inputCls = "w-full bg-black border border-neutral-800 text-white px-2.5 py-2 font-vercetti text-xs focus:outline-none focus:border-neutral-500 transition-colors rounded-sm";
const labelCls = "font-vercetti text-[9px] uppercase tracking-widest text-neutral-600 mb-1 block";
const btnCls = "border border-neutral-800 text-neutral-400 px-2.5 py-1.5 font-vercetti text-[10px] uppercase tracking-widest hover:bg-white hover:text-black transition-colors rounded-sm";
const btnDangerCls = "border border-red-900/80 text-red-500 px-2 py-1 font-vercetti text-[10px] uppercase tracking-widest hover:bg-red-700 hover:text-white hover:border-red-700 transition-colors rounded-sm shrink-0";
const btnPrimaryCls = "border border-neutral-300 text-white px-3 py-1.5 font-vercetti text-[10px] uppercase tracking-widest hover:bg-white hover:text-black transition-colors rounded-sm";
const btnResetCls = "border border-red-900/80 text-red-500 px-2.5 py-1.5 font-vercetti text-[10px] uppercase tracking-widest hover:bg-red-700 hover:text-white hover:border-red-700 transition-colors rounded-sm";

// ─── Fetch helper ─────────────────────────────────────────────────────────────
async function fetchAllSettings(): Promise<Record<string, unknown>> {
  const r = await fetch(apiUrl("/api/devkit/settings"), { credentials: "include" });
  if (!r.ok) return {};
  const d = await r.json() as Record<string, { data: unknown }>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d)) out[k] = v.data;
  return out;
}

// ─── Collapsible Card ─────────────────────────────────────────────────────────
function CollapsibleCard({
  id, title, subtitle, count, hasOverride, isDirty, onSave, onReset, saving, children,
}: {
  id: string; title: string; subtitle?: string; count?: number;
  hasOverride: boolean; isDirty: boolean; onSave: () => void; onReset: () => void; saving: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div id={id} className="bg-neutral-950 border border-neutral-800 rounded-sm overflow-hidden scroll-mt-20">
      {/* Header bar — clickable to collapse */}
      <div
        className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer hover:bg-neutral-900/50 transition-colors select-none"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={`text-[10px] transition-transform duration-200 ${open ? "rotate-90" : ""}`} style={{ display: "inline-block" }}>▶</span>
          <h2 className="font-soria text-base text-white shrink-0">{title}</h2>
          {count !== undefined && (
            <span className="font-vercetti text-[8px] uppercase tracking-widest text-neutral-500 border border-neutral-800 px-1.5 py-0.5 rounded-sm shrink-0">
              {count} {count === 1 ? "item" : "items"}
            </span>
          )}
          {hasOverride && (
            <span className="font-vercetti text-[8px] uppercase tracking-widest text-emerald-500 border border-emerald-900 px-1.5 py-0.5 rounded-sm shrink-0">DB</span>
          )}
          {isDirty && (
            <span className="font-vercetti text-[8px] uppercase tracking-widest text-amber-400 border border-amber-900 px-1.5 py-0.5 rounded-sm shrink-0 animate-pulse">Unsaved</span>
          )}
          {subtitle && <span className="font-vercetti text-[10px] text-neutral-600 truncate hidden sm:block">{subtitle}</span>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
          <button onClick={onReset} className={btnResetCls}>Reset</button>
          <button onClick={onSave} disabled={saving} className={btnPrimaryCls}>{saving ? "Saving…" : "Save"}</button>
        </div>
      </div>
      {open && <div className="border-t border-neutral-900 p-4 space-y-3">{children}</div>}
    </div>
  );
}

// ─── Item Card (collapsible for projects/timeline) ────────────────────────────
function ItemCard({
  index, label, summary, isNew, onMoveUp, onMoveDown, onRemove, children, defaultOpen,
}: {
  index: number; label: string; summary: string; isNew?: boolean;
  onMoveUp: () => void; onMoveDown: () => void; onRemove: () => void;
  children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div className={`border rounded-sm transition-colors ${isNew ? "border-amber-700/60 bg-amber-950/10" : "border-neutral-900"}`}>
      <div className="flex items-center justify-between gap-2 px-3 py-2 cursor-pointer hover:bg-neutral-900/30 transition-colors select-none" onClick={() => setOpen(o => !o)}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-vercetti text-[8px] text-neutral-600 shrink-0 w-6 text-right">{index + 1}</span>
          <span className={`text-[10px] transition-transform duration-200 ${open ? "rotate-90" : ""}`} style={{ display: "inline-block" }}>▶</span>
          <span className="font-vercetti text-xs text-neutral-300 truncate">{summary}</span>
          {isNew && <span className="font-vercetti text-[7px] uppercase tracking-widest text-amber-400 shrink-0">New</span>}
        </div>
        <div className="flex gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
          <button onClick={onMoveUp} className="border border-neutral-800 text-neutral-500 px-1.5 py-0.5 font-vercetti text-[9px] hover:bg-white hover:text-black transition-colors rounded-sm">↑</button>
          <button onClick={onMoveDown} className="border border-neutral-800 text-neutral-500 px-1.5 py-0.5 font-vercetti text-[9px] hover:bg-white hover:text-black transition-colors rounded-sm">↓</button>
          <button onClick={onRemove} className={btnDangerCls}>✕</button>
        </div>
      </div>
      {open && <div className="border-t border-neutral-900 p-3 space-y-2.5">{children}</div>}
    </div>
  );
}

// ─── Move buttons helper ──────────────────────────────────────────────────────
const MoveBtns = ({ onUp, onDown, onRemove }: { onUp: () => void; onDown: () => void; onRemove: () => void }) => (
  <div className="flex gap-0.5 shrink-0">
    <button onClick={onUp} className="border border-neutral-800 text-neutral-500 px-1.5 py-0.5 font-vercetti text-[9px] hover:bg-white hover:text-black transition-colors rounded-sm">↑</button>
    <button onClick={onDown} className="border border-neutral-800 text-neutral-500 px-1.5 py-0.5 font-vercetti text-[9px] hover:bg-white hover:text-black transition-colors rounded-sm">↓</button>
    <button onClick={onRemove} className={btnDangerCls}>✕</button>
  </div>
);

// ─── Section Nav ──────────────────────────────────────────────────────────────
const SECTIONS = [
  { id: "site_version", label: "Version" },
  { id: "footer_links", label: "Footer" },
  { id: "projects", label: "Projects" },
  { id: "work_timeline", label: "Work" },
  { id: "education_timeline", label: "Education" },
] as const;

function SectionNav({ dirtyMap }: { dirtyMap: Record<string, boolean> }) {
  return (
    <div className="sticky top-[52px] z-40 bg-black/90 backdrop-blur-sm border-b border-neutral-900 -mx-4 sm:-mx-8 px-4 sm:px-8 py-2">
      <div className="flex items-center gap-1.5 overflow-x-auto">
        {SECTIONS.map(s => (
          <a key={s.id} href={`#section-${s.id}`} className="flex items-center gap-1.5 shrink-0 border border-neutral-800 px-2.5 py-1 font-vercetti text-[9px] uppercase tracking-widest text-neutral-400 hover:text-white hover:border-neutral-600 transition-colors rounded-sm">
            {s.label}
            {dirtyMap[s.id] && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
          </a>
        ))}
      </div>
    </div>
  );
}

// ─── Footer Links Editor ──────────────────────────────────────────────────────
function FooterLinksEditor({ onSaved }: { onSaved: () => void }) {
  const [items, setItems] = useState<FooterLinkData[]>(defaultFooterLinks);
  const [saving, setSaving] = useState(false);
  const [hasOverride, setHasOverride] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const savedRef = useRef<string>("");

  useEffect(() => {
    fetchAllSettings().then((d) => {
      if (Array.isArray(d.footer_links)) { setItems(d.footer_links as FooterLinkData[]); setHasOverride(true); savedRef.current = JSON.stringify(d.footer_links); }
      else { savedRef.current = JSON.stringify(defaultFooterLinks); }
      setLoaded(true);
    }).catch(() => { savedRef.current = JSON.stringify(defaultFooterLinks); setLoaded(true); });
  }, []);

  const checkDirty = (newItems: FooterLinkData[]) => JSON.stringify(newItems) !== savedRef.current;

  const update = (i: number, field: keyof FooterLinkData, val: string) => {
    setItems(prev => { const n = prev.map((it, idx) => idx === i ? { ...it, [field]: val } as FooterLinkData : it); setDirty(checkDirty(n)); return n; });
  };
  const add = () => { setItems(prev => { const n = [...prev, { name: "New Link", hoverText: "", url: "https://", icon: "icons/email.svg" }]; setDirty(true); return n; }); };
  const remove = (i: number) => { setItems(prev => { const n = prev.filter((_, idx) => idx !== i); setDirty(checkDirty(n)); return n; }); };
  const move = (i: number, dir: -1 | 1) => {
    setItems(prev => {
      const j = i + dir; if (j < 0 || j >= prev.length) return prev;
      const copy = [...prev]; [copy[i], copy[j]] = [copy[j], copy[i]];
      setDirty(checkDirty(copy)); return copy;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch(apiUrl("/api/devkit/settings/footer_links"), {
        method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ data: items }),
      });
      if (r.ok) { setHasOverride(true); savedRef.current = JSON.stringify(items); setDirty(false); onSaved(); } else alert("Save failed");
    } catch { alert("Network error"); } finally { setSaving(false); }
  };

  const reset = async () => {
    if (!confirm("Reset footer links to hardcoded defaults?")) return;
    try {
      await fetch(apiUrl("/api/devkit/settings/footer_links"), { method: "DELETE", credentials: "include" });
      setItems(defaultFooterLinks); setHasOverride(false); savedRef.current = JSON.stringify(defaultFooterLinks); setDirty(false); onSaved();
    } catch { alert("Reset failed"); }
  };

  if (!loaded) return null;

  return (
    <CollapsibleCard id="section-footer_links" title="Footer Links" count={items.length} hasOverride={hasOverride} isDirty={dirty} onSave={save} onReset={reset} saving={saving}
      subtitle={items.map(i => i.name).join(" · ")}>
      {items.map((item, i) => (
        <div key={i} className="border border-neutral-900 rounded-sm p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-vercetti text-[9px] uppercase tracking-widest text-neutral-600">{item.name || `Link ${i + 1}`}</span>
            <MoveBtns onUp={() => move(i, -1)} onDown={() => move(i, 1)} onRemove={() => remove(i)} />
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
    </CollapsibleCard>
  );
}

// ─── Projects Editor ──────────────────────────────────────────────────────────
function ProjectsEditor({ onSaved }: { onSaved: () => void }) {
  const [items, setItems] = useState<ProjectData[]>(defaultProjects);
  const [saving, setSaving] = useState(false);
  const [hasOverride, setHasOverride] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [newIndex, setNewIndex] = useState(-1);
  const savedRef = useRef<string>("");

  useEffect(() => {
    fetchAllSettings().then((d) => {
      if (Array.isArray(d.projects)) { setItems(d.projects as ProjectData[]); setHasOverride(true); savedRef.current = JSON.stringify(d.projects); }
      else { savedRef.current = JSON.stringify(defaultProjects); }
      setLoaded(true);
    }).catch(() => { savedRef.current = JSON.stringify(defaultProjects); setLoaded(true); });
  }, []);

  const checkDirty = (newItems: ProjectData[]) => JSON.stringify(newItems) !== savedRef.current;

  const update = (i: number, field: keyof ProjectData, val: string) => {
    setItems(prev => { const n = prev.map((it, idx) => idx === i ? { ...it, [field]: val } as ProjectData : it); setDirty(checkDirty(n)); return n; });
  };
  const updateUrl = (pi: number, ui: number, field: keyof ProjectUrlData, val: string | boolean) => {
    setItems(prev => {
      const n = prev.map((p, idx) => {
        if (idx !== pi) return p;
        const urls = p.urls.map((u, j) => j === ui ? { ...u, [field]: val } as ProjectUrlData : u);
        return { ...p, urls };
      });
      setDirty(checkDirty(n)); return n;
    });
  };
  const addUrl = (pi: number) => {
    setItems(prev => {
      const n = prev.map((p, idx) => idx !== pi ? p : { ...p, urls: [...p.urls, { text: "LINK ↗", url: "https://" }] });
      setDirty(true); return n;
    });
  };
  const removeUrl = (pi: number, ui: number) => {
    setItems(prev => {
      const n = prev.map((p, idx) => idx !== pi ? p : { ...p, urls: p.urls.filter((_, j) => j !== ui) });
      setDirty(checkDirty(n)); return n;
    });
  };
  const add = () => {
    const newIdx = items.length;
    setItems(prev => { const n = [...prev, { title: "New Project", date: "2026", subtext: "", urls: [{ text: "VIEW ↗", disabled: true }] }]; setDirty(true); return n; });
    setNewIndex(newIdx);
    setTimeout(() => setNewIndex(-1), 3000);
  };
  const remove = (i: number) => { setItems(prev => { const n = prev.filter((_, idx) => idx !== i); setDirty(checkDirty(n)); return n; }); };
  const move = (i: number, dir: -1 | 1) => {
    setItems(prev => {
      const j = i + dir; if (j < 0 || j >= prev.length) return prev;
      const copy = [...prev]; [copy[i], copy[j]] = [copy[j], copy[i]];
      setDirty(checkDirty(copy)); return copy;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch(apiUrl("/api/devkit/settings/projects"), {
        method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ data: items }),
      });
      if (r.ok) { setHasOverride(true); savedRef.current = JSON.stringify(items); setDirty(false); onSaved(); } else alert("Save failed");
    } catch { alert("Network error"); } finally { setSaving(false); }
  };

  const reset = async () => {
    if (!confirm("Reset projects to hardcoded defaults?")) return;
    try {
      await fetch(apiUrl("/api/devkit/settings/projects"), { method: "DELETE", credentials: "include" });
      setItems(defaultProjects); setHasOverride(false); savedRef.current = JSON.stringify(defaultProjects); setDirty(false); onSaved();
    } catch { alert("Reset failed"); }
  };

  if (!loaded) return null;

  return (
    <CollapsibleCard id="section-projects" title="Projects" count={items.length} hasOverride={hasOverride} isDirty={dirty} onSave={save} onReset={reset} saving={saving}
      subtitle={`${items.length} projects · ${items.filter(p => p.urls.some(u => u.url && !u.disabled)).length} with live links`}>
      {items.map((item, i) => (
        <ItemCard key={i} index={i} label={`Project ${i + 1}`} summary={`${item.title} — ${item.date}`} isNew={newIndex === i}
          onMoveUp={() => move(i, -1)} onMoveDown={() => move(i, 1)} onRemove={() => remove(i)} defaultOpen={newIndex === i}>
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
                <button onClick={() => removeUrl(i, ui)} className={btnDangerCls}>✕</button>
              </div>
            ))}
            <button onClick={() => addUrl(i)} className={btnCls}>+ Add Link</button>
          </div>
        </ItemCard>
      ))}
      <button onClick={add} className={btnCls}>+ Add Project</button>
    </CollapsibleCard>
  );
}

// ─── Timeline Editor ──────────────────────────────────────────────────────────
function TimelineEditor({ section, title, defaults, onSaved }: { section: SectionKey; title: string; defaults: TimelinePointData[]; onSaved: () => void }) {
  const [items, setItems] = useState<TimelinePointData[]>(defaults);
  const [saving, setSaving] = useState(false);
  const [hasOverride, setHasOverride] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [newIndex, setNewIndex] = useState(-1);
  const savedRef = useRef<string>("");

  useEffect(() => {
    fetchAllSettings().then((d) => {
      if (Array.isArray(d[section])) { setItems(d[section] as TimelinePointData[]); setHasOverride(true); savedRef.current = JSON.stringify(d[section]); }
      else { savedRef.current = JSON.stringify(defaults); }
      setLoaded(true);
    }).catch(() => { savedRef.current = JSON.stringify(defaults); setLoaded(true); });
  }, [section]);

  const checkDirty = (newItems: TimelinePointData[]) => JSON.stringify(newItems) !== savedRef.current;

  const update = (i: number, field: keyof TimelinePointData, val: string) => {
    setItems(prev => { const n = prev.map((it, idx) => idx === i ? { ...it, [field]: val } as TimelinePointData : it); setDirty(checkDirty(n)); return n; });
  };
  const add = () => {
    const newIdx = items.length;
    setItems(prev => { const n = [...prev, { year: "2026", title: "New Entry", subtitle: "", position: (prev.length % 2 === 0 ? "right" : "left") as "left" | "right" }]; setDirty(true); return n; });
    setNewIndex(newIdx);
    setTimeout(() => setNewIndex(-1), 3000);
  };
  const remove = (i: number) => { setItems(prev => { const n = prev.filter((_, idx) => idx !== i); setDirty(checkDirty(n)); return n; }); };
  const move = (i: number, dir: -1 | 1) => {
    setItems(prev => {
      const j = i + dir; if (j < 0 || j >= prev.length) return prev;
      const copy = [...prev]; [copy[i], copy[j]] = [copy[j], copy[i]];
      setDirty(checkDirty(copy)); return copy;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch(apiUrl(`/api/devkit/settings/${section}`), {
        method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ data: items }),
      });
      if (r.ok) { setHasOverride(true); savedRef.current = JSON.stringify(items); setDirty(false); onSaved(); } else alert("Save failed");
    } catch { alert("Network error"); } finally { setSaving(false); }
  };

  const reset = async () => {
    if (!confirm(`Reset ${title} to hardcoded defaults?`)) return;
    try {
      await fetch(apiUrl(`/api/devkit/settings/${section}`), { method: "DELETE", credentials: "include" });
      setItems(defaults); setHasOverride(false); savedRef.current = JSON.stringify(defaults); setDirty(false); onSaved();
    } catch { alert("Reset failed"); }
  };

  if (!loaded) return null;

  return (
    <CollapsibleCard id={`section-${section}`} title={title} count={items.length} hasOverride={hasOverride} isDirty={dirty} onSave={save} onReset={reset} saving={saving}
      subtitle={items.map(i => `${i.year} ${i.title}`).join(" · ")}>
      {items.map((item, i) => (
        <ItemCard key={i} index={i} label={`Entry ${i + 1}`} summary={`${item.year} — ${item.title}`} isNew={newIndex === i}
          onMoveUp={() => move(i, -1)} onMoveDown={() => move(i, 1)} onRemove={() => remove(i)} defaultOpen={newIndex === i}>
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
        </ItemCard>
      ))}
      <button onClick={add} className={btnCls}>+ Add Entry</button>
    </CollapsibleCard>
  );
}

// ─── Site Version Editor ──────────────────────────────────────────────────────
function SiteVersionEditor({ onSaved }: { onSaved: () => void }) {
  const fallbackVersion = __APP_VERSION__.replace(/\.0$/, "");
  const [version, setVersion] = useState(fallbackVersion);
  const [saving, setSaving] = useState(false);
  const [hasOverride, setHasOverride] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const savedRef = useRef<string>(fallbackVersion);

  useEffect(() => {
    fetchAllSettings().then((d) => {
      if (typeof d.site_version === "string") { setVersion(d.site_version); setHasOverride(true); savedRef.current = d.site_version; }
      else { savedRef.current = fallbackVersion; }
      setLoaded(true);
    }).catch(() => { savedRef.current = fallbackVersion; setLoaded(true); });
  }, []);

  const updateVersion = (v: string) => { setVersion(v); setDirty(v !== savedRef.current); };

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch(apiUrl("/api/devkit/settings/site_version"), {
        method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ data: version }),
      });
      if (r.ok) { setHasOverride(true); savedRef.current = version; setDirty(false); onSaved(); } else alert("Save failed");
    } catch { alert("Network error"); } finally { setSaving(false); }
  };

  const reset = async () => {
    if (!confirm("Reset version to package.json default?")) return;
    try {
      await fetch(apiUrl("/api/devkit/settings/site_version"), { method: "DELETE", credentials: "include" });
      setVersion(fallbackVersion); setHasOverride(false); savedRef.current = fallbackVersion; setDirty(false); onSaved();
    } catch { alert("Reset failed"); }
  };

  if (!loaded) return null;

  return (
    <CollapsibleCard id="section-site_version" title="Site Version" hasOverride={hasOverride} isDirty={dirty} onSave={save} onReset={reset} saving={saving}
      subtitle={`Current: ${version}`}>
      <div>
        <label className={labelCls}>Version (e.g. 1.14)</label>
        <input className={inputCls} value={version} onChange={e => updateVersion(e.target.value)} placeholder="e.g. 1.14" />
      </div>
    </CollapsibleCard>
  );
}

// ─── Main Settings Tab ────────────────────────────────────────────────────────
const SettingsTab = () => {
  const fetchSettings = useSettingsStore((s) => s.fetchSettings);
  const onSaved = useCallback(() => { fetchSettings(); }, [fetchSettings]);

  return (
    <div className="space-y-4">
      <div className="bg-neutral-950 border border-neutral-800 rounded-sm p-4">
        <p className="font-vercetti text-[10px] text-neutral-500 leading-relaxed">
          Manage site content from the database. Editors are pre-populated with current hardcoded defaults.
          Save to override in the DB (green <span className="text-emerald-500">DB</span> badge = active override).
          Reset to revert to hardcoded defaults. Changes reflect on the home page on next load.
        </p>
      </div>
      <SectionNav dirtyMap={{}} />
      <SiteVersionEditor onSaved={onSaved} />
      <FooterLinksEditor onSaved={onSaved} />
      <ProjectsEditor onSaved={onSaved} />
      <TimelineEditor section="work_timeline" title="Work Timeline" defaults={defaultWorkTimeline} onSaved={onSaved} />
      <TimelineEditor section="education_timeline" title="Education Timeline" defaults={defaultEducationTimeline} onSaved={onSaved} />
    </div>
  );
};

export default SettingsTab;
