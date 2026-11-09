import { supabase } from "./supabase";

export const DEFAULT_SKILL_LEVELS = [
  { code: "new_player", name: "New Player", rating: 2, sort_order: 10, is_active: true, is_default: true },
  { code: "beginner", name: "Beginner", rating: 2.5, sort_order: 20, is_active: true, is_default: true },
  { code: "advanced_beginner", name: "Advanced Beginner", rating: 3, sort_order: 30, is_active: true, is_default: true },
  { code: "intermediate", name: "Intermediate", rating: 3.5, sort_order: 40, is_active: true, is_default: true },
  { code: "advanced_intermediate", name: "Advanced Intermediate", rating: 4, sort_order: 50, is_active: true, is_default: true },
  { code: "advanced", name: "Advanced", rating: 4.5, sort_order: 60, is_active: true, is_default: true },
  { code: "expert", name: "Expert", rating: 5, sort_order: 70, is_active: true, is_default: true },
  { code: "pro", name: "Pro", rating: 5.5, sort_order: 80, is_active: true, is_default: true },
];

export function canonicalSkillCode(value) {
  if (value === "novice") return "new_player";
  if (value === "competitive") return "pro";
  return value || "beginner";
}

export function skillCodeFromName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function skillLevelLabel(value, levels = DEFAULT_SKILL_LEVELS) {
  const code = canonicalSkillCode(value);
  const match = levels.find((level) => level.code === code);
  if (match) return match.name;
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function skillLevelRating(value, levels = DEFAULT_SKILL_LEVELS) {
  const code = canonicalSkillCode(value);
  return Number(levels.find((level) => level.code === code)?.rating || 2.5);
}

export async function loadEventSkillLevels(eventId, includeInactive = false) {
  let query = supabase
    .from("event_skill_levels")
    .select("*")
    .eq("event_id", eventId)
    .order("sort_order")
    .order("name");
  if (!includeInactive) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error || !data?.length) return DEFAULT_SKILL_LEVELS;
  return data;
}
