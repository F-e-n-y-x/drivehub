import { describe, expect, it } from "vitest";
import { IgnoreMatcher } from "./ignore.js";

describe("IgnoreMatcher", () => {
  const m = new IgnoreMatcher([
    ".git/**",
    "node_modules/**",
    "**/*.tmp",
    "**/.DS_Store",
    "build/",
    "# a comment",
  ]);

  it("ignores nested paths under a directory glob", () => {
    expect(m.ignores(".git/config")).toBe(true);
    expect(m.ignores("node_modules/pkg/index.js")).toBe(true);
  });

  it("ignores by extension anywhere in the tree", () => {
    expect(m.ignores("a/b/c.tmp")).toBe(true);
    expect(m.ignores("root.tmp")).toBe(true);
  });

  it("ignores a named file at any depth", () => {
    expect(m.ignores("deep/nested/.DS_Store")).toBe(true);
  });

  it("does not ignore unrelated files", () => {
    expect(m.ignores("src/index.ts")).toBe(false);
    expect(m.ignores("docs/report.pdf")).toBe(false);
  });

  it("normalizes backslashes to forward slashes", () => {
    expect(m.ignores("node_modules\\pkg\\x.js")).toBe(true);
  });

  it("skips comment lines", () => {
    expect(m.ignores("a comment")).toBe(false);
  });
});
