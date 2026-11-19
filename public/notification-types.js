export const NOTICE_GROUPS = {
  market: "Trading & market", wishlist: "Wishlist", quiz: "Quizzes",
  social: "Friends & credits", tour: "Tours",
};
export const NOTICE_TYPES = {
  "trade-request": ["market", "New trade offers"],
  "flash-open": ["market", "Flash shop opens"],
  "community-auction": ["market", "New community auction cards"],
  "wish-trade": ["wishlist", "Wishlisted card listed for trade"],
  "wish-auction": ["wishlist", "Wishlisted card listed at auction"],
  "wish-shop": ["wishlist", "Wishlisted card listed in a shop"],
  "quiz-leader-beaten": ["quiz", "Someone takes your quiz #1"],
  "quiz-personal-beaten": ["quiz", "Someone beats your quiz score"],
  "quiz-friend-beaten": ["quiz", "A friend beats your quiz score"],
  "quiz-new": ["quiz", "New quizzes"],
  "friend-add": ["social", "Someone adds you as a friend"],
  "credit-reward": ["social", "Credit rewards"],
  "pickem-new": ["tour", "New tour pick’ems"],
};
export const noticeDefault = kind => !["quiz-personal-beaten","quiz-friend-beaten"].includes(kind);
export const noticeGroup = kind => NOTICE_TYPES[kind]?.[0] || "market";

