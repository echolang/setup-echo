'use strict';

// release-please drops commits that are not conventional (`fix:`, `feat:`, ...).
// Echo libraries do not use that convention. Treat leftover commits as patch
// fixes so always-bump-patch actually bumps.
const commitMod = require('release-please/build/src/commit');
const originalParse = commitMod.parseConventionalCommits;
commitMod.parseConventionalCommits = function parseWithFallback(commits, logger) {
  const list = commits || [];
  const parsed = originalParse.call(this, list, logger);
  const seen = new Set(parsed.map((c) => c.sha));
  let fallbacks = 0;
  for (const commit of list) {
    if (seen.has(commit.sha)) {
      continue;
    }
    const firstLine = String(commit.message || '').split('\n')[0].trim();
    parsed.push({
      sha: commit.sha,
      message: `fix: ${firstLine}`,
      files: commit.files,
      pullRequest: commit.pullRequest,
      author: commit.author,
      type: 'fix',
      scope: null,
      bareMessage: firstLine,
      notes: [],
      references: [],
      breaking: false,
    });
    seen.add(commit.sha);
    fallbacks += 1;
  }
  if (fallbacks > 0) {
    console.log(
      `treated ${fallbacks} non-conventional commit(s) as patch fixes`
    );
  }
  return parsed;
};

const { GitHub, Manifest } = require('release-please');

async function main() {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.REPO;
  const branch = process.env.BRANCH;
  const changelog = process.env.CHANGELOG === 'true';
  if (!token) {
    throw new Error('GITHUB_TOKEN is missing');
  }
  if (!repo || !repo.includes('/')) {
    throw new Error(`REPO must be owner/name, got ${repo}`);
  }
  if (!branch) {
    throw new Error('BRANCH is missing');
  }

  const [owner, name] = repo.split('/');
  const github = await GitHub.create({ owner, repo: name, token });
  const config = {
    releaseType: 'simple',
    versioning: 'always-bump-patch',
    extraFiles: [{ type: 'generic', path: 'module.eco' }],
    includeVInTag: true,
    includeComponentInTag: false,
    skipChangelog: !changelog,
    pullRequestHeader: 'This PR bumps the patch.',
    pullRequestFooter: 'Merge it and the tag goes out.',
  };

  const manifest = await Manifest.fromConfig(github, branch, config);

  // Tag first. Opening the next PR before that treats the merged bump as
  // already released, then dies generating notes against a tag that does
  // not exist yet.
  try {
    const releases = await manifest.createReleases();
    console.log('github releases:', JSON.stringify(releases, null, 2));
  } catch (err) {
    if (err && err.constructor && err.constructor.name === 'DuplicateReleaseError') {
      console.log('no new github release to tag');
    } else {
      throw err;
    }
  }

  const prs = await manifest.createPullRequests();
  console.log('release pull requests:', JSON.stringify(prs, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
