import { searchTerms } from "../public/search.js";

// Expressions are static source-code SQL, never supplied by a request.
// Search values remain bound parameters, with literal %, _ and quotes.
export function searchSql(expression, query) {
  const args = searchTerms(query);
  return {
    where: args.length
      ? args.map(() => `instr(lower(${expression}),?)>0`).join(" AND ")
      : "1",
    args,
  };
}

export function profileSearchSql(query) {
  const terms = searchTerms(query);
  return {
    where: terms.length
      ? terms
          .map(
            () =>
              `(instr(lower(p.id),?)>0 OR instr(lower(p.name),?)>0 OR instr(lower(COALESCE(p.display_name,'')),?)>0 OR EXISTS(SELECT 1 FROM aliases a WHERE a.player=p.id AND instr(lower(a.alias),?)>0) OR EXISTS(SELECT 1 FROM usernames u WHERE u.player=p.id AND instr(lower(u.username),?)>0))`,
          )
          .join(" AND ")
      : "1",
    args: terms.flatMap((term) => Array(5).fill(term)),
  };
}
