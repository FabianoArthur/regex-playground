# Contributing

Thanks for taking the time to help.

1. Fork the repository and create a branch from the default branch.
2. `npm ci`, then `npm run dev` to work on the app.
3. Parser or explainer changes need tests. Write a failing test in `src/regex/*.test.ts` first, then
   make it pass. If you touch the parser, keep the differential test ("accepts and rejects exactly what
   `new RegExp` does") green.
4. Before opening a pull request, run `npm run lint && npm run typecheck && npm test && npm run build`.
5. Use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages
   (`feat: …`, `fix: …`, `docs: …`).

Bug reports are welcome as issues. Please include the pattern, the flags and the test text. The
"Copy share link" button puts all three in one URL.
