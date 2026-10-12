# t3-feedback

Send UI feedback from a staging page straight into a T3 Code thread on one of your machines.

A **Widget** on the staging page collects a message and a screenshot. A **Receiver** on each **Machine** (reachable over your tailnet) turns that **Feedback** into a new T3 Code **Thread** in a fresh worktree of the matching **Project**.

Status: the Receiver is in [receiver/](receiver/) (Node 22+, `npm test`); the Widget is not started. Start with:

- [CONTEXT.md](CONTEXT.md): the vocabulary.
- [docs/PRD.md](docs/PRD.md): what to build and why.
- [docs/adr/](docs/adr/): the two decisions that are not obvious from the code.

Embed snippets, Receiver setup, and release notes will land here as the tickets are implemented.
