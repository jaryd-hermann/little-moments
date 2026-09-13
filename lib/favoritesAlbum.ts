import * as MediaLibrary from "expo-media-library";

/**
 * Localized titles for the iOS/Android "Favorites" smart album. `expo-media-library`
 * exposes the album `title` but not the underlying smart-album subtype, so we
 * match by title with a small allow-list plus a `favorit`/`favourit` substring
 * fallback for locales we haven't enumerated.
 */
const FAVORITES_ALBUM_TITLES = new Set([
  "favorites",
  "favourites",
  "favoriten",
  "favoris",
  "favoritos",
  "favoriti",
  "preferiti",
  "preferidos",
  "избранное",
  "お気に入り",
  "즐겨찾기",
  "收藏",
  "收藏夹",
  "我的最愛",
]);

/**
 * The user's Favorites album, or null when it can't be found — which callers
 * should read as "no favorites" and fall back to the whole library rather than
 * showing nothing.
 */
export async function findFavoritesAlbum(): Promise<MediaLibrary.Album | null> {
  try {
    const albums = await MediaLibrary.getAlbumsAsync({
      includeSmartAlbums: true,
    });
    for (const album of albums) {
      const title = album.title.trim().toLowerCase();
      if (FAVORITES_ALBUM_TITLES.has(title)) return album;
    }
    for (const album of albums) {
      const title = album.title.trim().toLowerCase();
      if (title.includes("favorit") || title.includes("favourit")) {
        return album;
      }
    }
  } catch {
    /* fail closed — caller treats null as "no favorites" */
  }
  return null;
}
