/**
 * worktrees-gitignore fixer — append a `.worktrees/` entry to .gitignore.
 * Idempotent: returns the input unchanged when the entry already exists.
 */

export function addWorktreesToGitignore(text: string): string {
  const present = text.split(/\r?\n/).some((line) => {
    const t = line.trim();
    return t === ".worktrees" || t === ".worktrees/";
  });
  if (present) return text;
  const sep = text.length === 0 || text.endsWith("\n") ? "" : "\n";
  return text + sep + ".worktrees/\n";
}
