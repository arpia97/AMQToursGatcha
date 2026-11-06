export const DEFAULT_AVATAR_CROP = Object.freeze({ x: 0.5, y: 0.2, zoom: 1 });
export function validateAvatarCrop(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !["x", "y", "zoom"].every(
      (k) => typeof value[k] === "number" && Number.isFinite(value[k]),
    ) ||
    value.x < 0 ||
    value.x > 1 ||
    value.y < 0 ||
    value.y > 1 ||
    value.zoom < 1 ||
    value.zoom > 3
  )
    throw new Error("Choose a valid profile-picture crop (zoom 1–3×).");
  return { x: value.x, y: value.y, zoom: value.zoom };
}
export function avatarCrop(value) {
  try {
    return validateAvatarCrop(
      typeof value === "string" ? JSON.parse(value) : value,
    );
  } catch {
    return { ...DEFAULT_AVATAR_CROP };
  }
}
export function avatarCropStyle(value) {
  const c = avatarCrop(value);
  return (
    "--avatar-x:" +
    c.x * 100 +
    "%;--avatar-y:" +
    c.y * 100 +
    "%;--avatar-zoom:" +
    c.zoom
  );
}
export function panAvatarCrop(value, dx, dy, size, width, height) {
  const c = avatarCrop(value),
    cover = Math.max(size / width, size / height);
  const overflowX = width * cover * c.zoom - size,
    overflowY = height * cover * c.zoom - size;
  const clamp = (n) => Math.max(0, Math.min(1, n));
  return {
    ...c,
    x: overflowX > 0.01 ? clamp(c.x - dx / overflowX) : c.x,
    y: overflowY > 0.01 ? clamp(c.y - dy / overflowY) : c.y,
  };
}
