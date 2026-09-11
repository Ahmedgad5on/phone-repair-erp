module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "feat",     // New feature
        "fix",      // Bug fix
        "docs",     // Documentation
        "style",    // Formatting (no code change)
        "refactor", // Code refactoring
        "perf",     // Performance improvement
        "test",     // Adding tests
        "build",    // Build system or dependencies
        "ci",       // CI configuration
        "chore",    // Other changes
        "revert",   // Revert a commit
      ],
    ],
    "scope-case": [2, "always", "lower-case"],
    "subject-case": [2, "never", ["start-case", "pascal-case", "upper-case"]],
    "subject-empty": [2, "never"],
    "subject-full-stop": [2, "never", "."],
    "header-max-length": [2, "always", 100],
  },
};
