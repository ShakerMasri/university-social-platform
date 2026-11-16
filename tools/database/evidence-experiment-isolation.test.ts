import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";
import ts from "typescript";

const root = resolve("."), portable = (path: string) => relative(root, path).replaceAll("\\", "/");
const config = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
if (config.error) throw new Error("Cannot inspect production import boundary");
const options = ts.parseJsonConfigFileContent(config.config, ts.sys, root).options;

function imports(path: string, text: string) {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const specifiers: string[] = [], errors: string[] = [];
  function inspect(node: ts.Node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) specifiers.push(node.moduleSpecifier.text);
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && node.moduleReference.expression && ts.isStringLiteralLike(node.moduleReference.expression)) specifiers.push(node.moduleReference.expression.text);
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === "require")) {
      const value = node.arguments[0];
      if (value && ts.isStringLiteralLike(value)) specifiers.push(value.text);
      else errors.push(`${portable(path)}: nonliteral module load needs boundary review`);
    }
    ts.forEachChild(node, inspect);
  }
  inspect(source);
  return { specifiers, errors };
}
function forbidden(path: string) {
  const name = portable(path);
  return name.startsWith("tests/") || name.startsWith("tools/database/evidence-") || /\.(test|spec)\.[cm]?[jt]sx?$/.test(name);
}
function roots(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "generated" ? [] : roots(path);
    return /\.[cm]?tsx?$/.test(entry.name) && !forbidden(path) ? [path] : [];
  });
}

describe("M5-04 experimental code stays outside the production import graph", () => {
  it("checks source roots, Next configuration and transitive local dependencies without executing them", () => {
    const pending = [...roots(resolve("src")), resolve("next.config.ts")], visited = new Set<string>(), failures: string[] = [];
    while (pending.length) {
      const path = pending.pop()!;
      if (visited.has(path)) continue; visited.add(path);
      const scanned = imports(path, readFileSync(path, "utf8")); failures.push(...scanned.errors);
      for (const specifier of scanned.specifiers) {
        const target = ts.resolveModuleName(specifier, path, options, ts.sys).resolvedModule?.resolvedFileName;
        if (!target || target.includes("node_modules") || portable(target).startsWith("src/generated/")) continue;
        if (forbidden(target)) failures.push(`${portable(path)} imports research/test code: ${specifier}`);
        else if (!portable(target).startsWith("../")) pending.push(resolve(target));
      }
    }
    expect(visited.size).toBeGreaterThan(0); expect(failures).toEqual([]);
  });
  it("detects static, dynamic, re-export, require and aliased research imports", () => {
    const path = resolve("src/import-boundary-fixture.ts");
    const scanned = imports(path, `import x from "../tools/database/evidence-ranking-experiment";
      export * from "../tools/database/evidence-comment-experiment";
      import("../tools/database/evidence-passage-experiment");
      require("@/../tools/database/evidence-ranking-revision");`);
    expect(scanned.specifiers).toHaveLength(4);
    for (const specifier of scanned.specifiers) {
      const target = ts.resolveModuleName(specifier, path, options, ts.sys).resolvedModule?.resolvedFileName;
      expect(target).toBeDefined(); expect(forbidden(target!)).toBe(true);
    }
    expect(imports(path, "import(computedPath)").errors).toHaveLength(1);
  });
});
