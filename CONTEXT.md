# t3-feedback

A loop from a staging page to a T3 Code thread: a person viewing a staging site sends a message and a screenshot, and a coding agent on one of their machines starts working on it.

## Language

**Widget**:
The script embedded in a staging page that collects a Feedback and sends it to a Receiver.
_Avoid_: button, form, plugin, snippet

**Receiver**:
The service on a Machine that accepts a Feedback and opens a Thread for it in that Machine's T3 Code.
_Avoid_: sidecar, server, relay, backend

**Machine**:
A tailnet host that runs T3 Code and a Receiver.
_Avoid_: runner, agent host, device, computer

**Feedback**:
One submission: a message, an optional screenshot, and the page it was sent from.
_Avoid_: ticket, report, issue, request

**Project**:
A repository the Feedback is about, identified by its GitHub slug (owner/name). On a Machine it corresponds to one T3 Code project.
_Avoid_: site, theme, app, workspace

**Thread**:
The T3 Code conversation a Receiver opens for one Feedback. One Feedback always produces one new Thread.
_Avoid_: session, task, job

**Staging page**:
A page of a non-production deployment where the Widget is shown. Production pages never show the Widget.
_Avoid_: dev site, preview
