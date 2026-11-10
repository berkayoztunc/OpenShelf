import { api } from "./api";

export type MediaKind = "logo" | "logo_dark" | "favicon" | "banner" | "og" | "product";
export interface MediaResult { id: string; url: string; mime: string; size: number; width?: number; height?: number; warnings?: string[] }
export const MEDIA_ACCEPT = "image/png,image/jpeg,image/webp,image/gif,image/avif";
export const mediaUrl = (id: string | null | undefined) => (id ? `/media/${id}` : "");

export function uploadMedia(file: File, kind: MediaKind, alt?: string): Promise<MediaResult> {
  const form = new FormData();
  form.append("kind", kind);
  if (alt?.trim()) form.append("alt", alt.trim());
  form.append("file", file);
  return api.upload<MediaResult>("/api/admin/media", form);
}
