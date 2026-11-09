import { supabase } from "./supabase";

export async function loadPlayerCategories(eventId) {
  const { data, error } = await supabase
    .from("event_player_categories")
    .select("*")
    .eq("event_id", eventId)
    .order("sort_order")
    .order("name");
  if (error) return [];
  return data || [];
}
