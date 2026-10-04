/** The templates cited by each numbered sense (";1: …") of the Spanish section of a page. */
export function citationsBySense(page: string): Map<string, string[]> {
  const start = page.search(/^==\s*\{\{lengua\|es\}\}/mu);
  if (start < 0) return new Map();
  const end = page.slice(start + 2).search(/^==\s*\{\{lengua\|/mu);
  const spanish = page.slice(start, end < 0 ? undefined : start + 2 + end);
  const named = new Map<string, string[]>();
  for (const [, name = "", body = ""] of spanish.matchAll(
    /<ref\s+name\s*=\s*"?([^">/]+?)"?\s*>(.*?)<\/ref>/gsu,
  )) {
    named.set(name.trim(), templates(body));
  }
  const citations = new Map<string, string[]>();
  for (const [, number = "", definition = ""] of spanish.matchAll(
    /^;(\d+)[^:\n]*:(.*)$/gmu,
  )) {
    const cited = [
      ...[...definition.matchAll(/<ref(?:\s[^>]*)?>(.*?)<\/ref>/gu)].flatMap(
        ([, body = ""]) => templates(body),
      ),
      ...[
        ...definition.matchAll(/<ref\s+name\s*=\s*"?([^">/]+?)"?\s*\/>/gu),
      ].flatMap(([, name = ""]) => named.get(name.trim()) ?? []),
    ];
    // A number repeated across etymologies keeps the citations of both.
    citations.set(number, [...(citations.get(number) ?? []), ...cited]);
  }
  return citations;
}

/** The names of the templates in wikitext: "DRAE2001" in "{{DRAE2001|p=3}}". */
function templates(wikitext: string): string[] {
  return [...wikitext.matchAll(/\{\{\s*([^|}]+?)\s*[|}]/gu)].map(
    ([, name = ""]) => name,
  );
}
