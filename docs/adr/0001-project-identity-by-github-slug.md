---
status: accepted
---

# Project identity is the GitHub slug, not the T3 Code title

T3 Code identifies a project by a per-machine UUID plus a title that defaults to the folder name, and it stores no git remote. A Widget is embedded in many staging sites and must name its Project the same way on every Machine, so the Widget uses the GitHub slug (`owner/name`) and the Receiver resolves it by reading the `origin` remote of each T3 Code project's workspace root. Titles were rejected because a differently named clone on one Machine would silently route Feedback to nothing; UUIDs were rejected because they differ per Machine.

## Consequences

- The Receiver runs one git command per known project at lookup time. Acceptable for tens of projects.
- A repository without an `origin` remote can never receive Feedback. Deliberate.
- A later "clone and create the project when missing" feature becomes possible because the slug is enough to clone.
