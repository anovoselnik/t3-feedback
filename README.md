# t3-feedback

Send UI feedback from a staging page straight into a T3 Code thread on one of your machines.

A **Widget** on the staging page collects a message and a screenshot. A **Receiver** on each **Machine** (reachable over your tailnet) turns that **Feedback** into a new T3 Code **Thread** in a fresh worktree of the matching **Project**.

Status: the Receiver is in [receiver/](receiver/) (Node 22+, `npm test`) and runs as a service on Linux ([docs/setup-linux.md](docs/setup-linux.md)). The Widget is in [widget/](widget/): it probes every configured Machine, offers the online ones in a chooser that remembers the last one used per site, and sends Feedback with an optional screenshot, pasted or picked. To try it without a Machine, run `npm run test-page` and open http://localhost:7779: the page embeds the Widget against an echo Receiver that shows each Feedback instead of opening a Thread. Start with:

- [CONTEXT.md](CONTEXT.md): the vocabulary.
- [docs/PRD.md](docs/PRD.md): what to build and why.
- [docs/adr/](docs/adr/): the two decisions that are not obvious from the code.

Embed snippets, Receiver setup, and release notes will land here as the tickets are implemented.
