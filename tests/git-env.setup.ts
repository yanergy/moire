// Git hooks run with GIT_DIR, GIT_INDEX_FILE and friends set to the repository being
// committed to. Tests that spawn git (temp repos in git-service.spec.ts, GitService
// itself) inherit process.env, so under the pre-commit hook those variables would point
// their `git -C <temp repo>` calls at the real repository instead: commits, staging and
// `git init` would land there. Clearing every GIT_* variable before any test runs keeps
// each git call on the repository it names.
for (const key of Object.keys(process.env)) {
    if (key.startsWith('GIT_')) {
        delete process.env[key];
    }
}
