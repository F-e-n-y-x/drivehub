/**
 * Glob-based ignore matching for relative POSIX paths (e.g. "a/b/c.txt").
 * Supports the common subset used in .gitignore-style patterns:
 *   **  matches any number of path segments
 *   *   matches anything except "/"
 *   ?   matches a single non-"/" char
 * A trailing "/**" also matches the directory itself.
 */
export class IgnoreMatcher {
  private readonly regexes: RegExp[];

  constructor(patterns: string[]) {
    this.regexes = patterns
      .map((p) => p.trim())
      .filter((p) => p.length > 0 && !p.startsWith("#"))
      .map((p) => new RegExp(globToRegExp(p)));
  }

  ignores(relPath: string): boolean {
    const norm = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
    return this.regexes.some((re) => re.test(norm));
  }
}

function globToRegExp(glob: string): string {
  const g = glob.replace(/\\/g, "/").replace(/^\/+/, "");
  let re = "^";
  for (let i = 0; i < g.length; i++) {
    const c = g[i]!;
    if (c === "*") {
      if (g[i + 1] === "*") {
        // "**" — any number of segments
        i++;
        if (g[i + 1] === "/") {
          i++;
          re += "(?:.*/)?";
        } else {
          re += ".*";
        }
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else if ("+.^$()[]{}|".includes(c)) {
      re += "\\" + c;
    } else if (c === "/") {
      re += "/";
    } else {
      re += c;
    }
  }
  re += "$";
  return re;
}
