export const COMMUNITY_AUCTION_MS = 12 * 3600000;
export const FLASH_SHOP_MS = 3 * 3600000;
export const FLASH_WEIGHTS = Object.freeze({
  S: 30,
  SS: 30,
  SSS: 25,
  Ubers: 12,
  AG: 3,
});
export function minimumBid(auction) {
  return auction.bid
    ? Math.max(
        auction.bid + 1,
        Math.ceil((auction.bid * (auction.rolling ? 11 : 10)) / 10),
      )
    : auction.reserve || 1;
}
