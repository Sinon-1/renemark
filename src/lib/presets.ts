import { supabase } from "@/lib/supabase";
import type { WatermarkSettings } from "@/lib/watermark";

export interface Preset extends WatermarkSettings {
  id: string;
  name: string;
  asset_path: string | null;
}

const need = () => {
  if (!supabase) throw new Error("Supabase is not configured. Add your keys to .env.");
  return supabase;
};

export async function listPresets(): Promise<Preset[]> {
  const { data, error } = await need()
    .from("presets")
    .select("id,name,scale,opacity,rotation,x,y,asset_path")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as Preset[];
}

/** Saves the settings, and uploads the watermark image to Storage if one is loaded. */
export async function savePreset(userId: string, name: string, s: WatermarkSettings, markFile: File | null) {
  const sb = need();
  let asset_path: string | null = null;
  if (markFile) {
    const ext = markFile.name.split(".").pop() || "png";
    asset_path = `${userId}/${crypto.randomUUID()}.${ext}`; // first folder = user id (see storage policy)
    const { error } = await sb.storage.from("watermarks").upload(asset_path, markFile);
    if (error) throw error;
  }
  const { error } = await sb.from("presets").insert({ user_id: userId, name, ...s, asset_path });
  if (error) throw error;
}

export async function deletePreset(p: Preset) {
  const sb = need();
  const { error } = await sb.from("presets").delete().eq("id", p.id);
  if (error) throw error;
  if (p.asset_path) await sb.storage.from("watermarks").remove([p.asset_path]);
}

export async function downloadAsset(path: string): Promise<Blob> {
  const { data, error } = await need().storage.from("watermarks").download(path);
  if (error) throw error;
  return data;
}
