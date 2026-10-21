// Parse source only: never import entrypoints, read runtime state or execute tools.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { URL, fileURLToPath } from "node:url";
import { stripTypeScriptTypes } from "node:module";
import process from "node:process";
import ts from "typescript";

const root = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const files = new Set();
function audit(file) {
  file = resolve(file);
  const name = relative(root, file);
  if (isAbsolute(name) || name === ".." || name.startsWith(".." + sep)) throw new Error("OUTSIDE_CHECKOUT");
  if (files.has(file)) return;
  files.add(file);
  let stripped;
  try { stripped = stripTypeScriptTypes(readFileSync(file, "utf8"), { mode: "strip" }); }
  catch { throw new Error("STRIP_UNSUPPORTED:" + name.replaceAll(sep, "/")); }
  // Inspect the stripped code so erased type imports cannot enter the runtime graph.
  const tree = ts.createSourceFile(file, stripped, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const follow = (specifier) => {
    if (!specifier.startsWith(".")) return; // Installed packages provide their own JS runtime.
    const target = resolve(dirname(file), specifier);
    if (!existsSync(target)) throw new Error("RUNTIME_IMPORT_MISSING:" + name.replaceAll(sep, "/"));
    if (/\.(?:ts|mts|cts|tsx)$/.test(target)) audit(target);
  };
  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) follow(node.moduleSpecifier.text);
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === "require")) &&
        node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])) follow(node.arguments[0].text);
    ts.forEachChild(node, visit);
  };
  visit(tree);
}
function entries(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = resolve(directory, entry.name);
    if (entry.isDirectory()) entries(file);
    else if (/\.(?:ts|mts|cts)$/.test(entry.name) && !/\.(?:test|d)\.ts$/.test(entry.name)) audit(file);
  }
}
try {
  entries(resolve(root, "tools"));
  for (const name of ["prisma.config.ts", "next.config.ts"]) audit(resolve(root, name));
  process.stdout.write(JSON.stringify({ node: process.versions.node, mode: "strip", files: [...files].map((file) => relative(root, file).replaceAll(sep, "/")).sort() }) + "\n");
} catch (error) {
  process.stderr.write("Native TypeScript compatibility check failed: " + error.message + "\n");
  process.exitCode = 1;
}
