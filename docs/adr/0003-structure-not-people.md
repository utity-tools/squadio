# 0003. Squadio analyses structure, not people

- **Status:** accepted
- **Date:** 2026-10-14

## Context

Staffing and restructuring tools deal with people's jobs and pay. An app that ranks individuals or
suggests who to drop from a team would cause real harm, and an AI doing it with confidence would be
worse. Squadio will add an AI assistant in v1.0.

## Decision

- Health checks (v0.4) and the AI assistant (v1.0) look at **team structure and cost**: allocation,
  seniority mix, ratios, single points of failure, margin. They never assess or rank individuals and
  never suggest who to remove.
- The AI reasons over results the deterministic health checks already computed. It explains,
  prioritizes and proposes changes; a person accepts or discards each proposal, validated with Zod.
- The model receives **pseudonymous data only**: ids, categories, allocations, dates and health
  check results. No names of people or clients, and no exact costs (bands at most).
- AI calls go only to providers that do not train on the data sent; if none is available, the call
  fails.
- The README states what is sent, what is stored and these limits.

## Alternatives considered

- **Let the AI detect problems directly:** less code, but non-deterministic, harder to test and
  costlier, and its findings could not be verified.
- **Send full context to the model:** better wording, but it would send personal and pay data to a
  third party.

## Consequences

- The product is complete without the AI; v1.0 adds explanation on top, not core logic.
- Prompts and evals must check that answers stay about structure, not people.
- Some useful advice, such as "this person is overloaded on purpose", is out of reach by design.
