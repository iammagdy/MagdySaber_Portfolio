import { create } from "zustand";
import * as THREE from "three";
import { FOOTER_LINKS, PROJECTS, WORK_TIMELINE, EDUCATION_TIMELINE } from "../constants";
import type { FooterLink, Project, WorkTimelinePoint } from "../types";
import { calcWorkPosition, calcEducationPosition } from "../utils/timelinePositions";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
const apiUrl = (path: string) => `${API_BASE}${path}`;

const FALLBACK_VERSION = __APP_VERSION__.replace(/\.0$/, "");

interface SettingsState {
  footerLinks: FooterLink[];
  projects: Project[];
  workTimeline: WorkTimelinePoint[];
  educationTimeline: WorkTimelinePoint[];
  siteVersion: string;
  loaded: boolean;
  fetchSettings: () => Promise<void>;
}

interface RawTimelinePoint {
  year: string;
  title: string;
  subtitle?: string;
  description?: string;
  position: "left" | "right";
}

const hydrateTimeline = (
  raw: RawTimelinePoint[],
  calc: (index: number, position: "left" | "right") => THREE.Vector3,
): WorkTimelinePoint[] =>
  raw.map((p, i) => ({
    ...p,
    point: calc(i, p.position),
  }));

export const useSettingsStore = create<SettingsState>((set) => ({
  footerLinks: FOOTER_LINKS,
  projects: PROJECTS,
  workTimeline: WORK_TIMELINE,
  educationTimeline: EDUCATION_TIMELINE,
  siteVersion: FALLBACK_VERSION,
  loaded: false,

  fetchSettings: async () => {
    try {
      const r = await fetch(apiUrl("/api/public/site-settings"), { cache: "no-store" });
      if (!r.ok) return;
      const data = (await r.json()) as Record<string, unknown>;
      set((state) => ({
        footerLinks: Array.isArray(data.footer_links) ? (data.footer_links as FooterLink[]) : state.footerLinks,
        projects: Array.isArray(data.projects) ? (data.projects as Project[]) : state.projects,
        workTimeline: Array.isArray(data.work_timeline)
          ? hydrateTimeline(data.work_timeline as RawTimelinePoint[], calcWorkPosition)
          : state.workTimeline,
        educationTimeline: Array.isArray(data.education_timeline)
          ? hydrateTimeline(data.education_timeline as RawTimelinePoint[], calcEducationPosition)
          : state.educationTimeline,
        siteVersion: typeof data.site_version === "string" ? data.site_version : state.siteVersion,
        loaded: true,
      }));
    } catch {
      // Silently fall back to hardcoded constants
    }
  },
}));
