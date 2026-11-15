import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { quizTitleRows } from "../public/quiz-title-display.js";

export async function writeQuizTitleNames(master) {
  await fs.writeFile(new URL("../public/quiz-anime-titles.json", import.meta.url), JSON.stringify(quizTitleRows(master)) + "\n");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const master = JSON.parse(await fs.readFile(new URL("../public/quiz-amq-master.json", import.meta.url), "utf8"));
  await writeQuizTitleNames(master);
}
