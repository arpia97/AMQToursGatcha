import { quizAnswerKey } from "./quiz-rules.js";
const searchKey = (value) =>
  quizAnswerKey(value)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
export function quizAnswerOptions(answers, query, limit = 20) {
  const key = searchKey(query);
  if (!key) return [];
  const words = key.split(" ");
  return answers
    .map((title, index) => {
      const normalized = searchKey(title);
      const rank = normalized.startsWith(key)
        ? 0
        : normalized.includes(key)
          ? 1
          : words.every((word) => normalized.includes(word))
            ? 2
            : 3;
      return { title, index, rank };
    })
    .filter((row) => row.rank < 3)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .slice(0, limit)
    .map((row) => row.title);
}
