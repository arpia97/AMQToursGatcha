// Older receipts, match rosters and import files can retain the retired image origin.
export function communityPortraitUrl(image) {
  if (typeof image !== 'string') return image;
  const legacy = /^https:\/\/play\.amqtours-gatcha\.workers\.dev\/(?:gacha\/)?community-cards\/([a-z0-9_-]+\.(?:png|jpe?g|webp|gif))(?:[?#].*)?$/i.exec(image);
  return legacy ? 'https://amqtours.app/gacha/community-cards/' + legacy[1] : image;
}
