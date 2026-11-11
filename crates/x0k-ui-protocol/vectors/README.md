# The UI-control conformance vectors

These files are the conformance suite for the UI-control endpoint
(`corpora/x0k/decisions/architecture/surfaces/ui-control-channel.md` and
`corpora/x0k/decisions/architecture/surfaces/ui-interfaces.md`). Any
implementation of the endpoint runs the same files. x0k's run is
`tests/conformance.rs`.

Each file holds the vectors for one check of one section:

- `clause`: the section of the decision the vectors hold to;
- `check`: what an implementation does with each vector's input;
- `about`: the claim;
- `vectors`: each a `name`, an `input` and the `expect`ed answer.

An expectation matches an answer when every field it names matches: an object
by its named keys (others are ignored), an array element by element, and `null`
when the field is absent or null.

| File | Check | Clause |
|---|---|---|
| `observe.json` | `observation.fit`: whether an observation answers its call | §8 |
| `act.json` | `act.check`: what an app does with an `invoke` before it runs anything | §9 |
| `input.json` | `input.check`: what an app does with a `perform` before any of it runs | §10 |
| `history.json` | `history.fit`: whether a `history` answer answers its call | ui-interfaces §2 |
| `history-offer.json` | `history.offer`: whether an offer says what it holds exactly when it names `ui/history` | ui-interfaces §5 |
| `navigate.json` | `history.navigate`: what an app does with a `navigate` before it shows anything | ui-interfaces §2 |
| `showing.json` | `history.while_shown`: what an app runs while it shows a past position | ui-interfaces §2 |
| `merge-patch.json` | `fixture.merge_patch`: a JSON Merge Patch applied, as RFC 7396's own examples | ui-interfaces §4 |
| `present.json` | `fixture.present`: what an app does with a `present` before it shows anything | ui-interfaces §4 |
| `replay-policy.json` | `offer.replay_policy`: whether an offer's replay policy can be read | ui-interfaces §5 |
| `disposition.json` | `replay.disposition`: what an effect takes on a trip, by the replay policy | ui-interfaces §4, §5 |
| `classes.json` | `operation.class`: the side-effect class each operation declares | ui-interfaces §1 |
| `cannot-paint.json` | `observe.while_cannot_paint`: what an app whose host cannot paint its window answers of an `observe` | §8 |
| `deliver.json` | `input.delivers`: what a host does with a `perform` holding a kind it cannot deliver | §10 |
| `refusals.json` | `refusal.read`: which words a refusal's code reads as | §8 to §10, ui-interfaces §4 |
| `release.json` | `fixture.release_read`: what a `release` answers, among it a fixture the app ended | ui-interfaces §4 |

A bare section number is a section of `ui-control-channel`.

A refusal's `code` is one of the words below, and an implementation uses the
same word. `subject` names what it is about. `why` is for a person, and no vector
compares it.

`unknown_action`, `outside_grant`, `misfit_arguments`, `unreadable_shape`,
`no_input_interface`, `unknown_source`, `duplicate_source`, `wrong_source`,
`unknown_key`, `outside_frame`, `unknown_frame`, `unknown_node`,
`no_history_interface`, `unknown_position`, `showing_past`, `no_fixtures`,
`wrong_fingerprint`, `misfit_state`, `stale_head`, `unreadable_policy`,
`policy_refuses`, `undeliverable_source`, `cannot_paint`, `declined`,
`fixture_ended`.

A part an observation refuses may carry a `code` too: `cannot_paint` when the
host cannot paint the window now. A part refusal with no code
gives only its `why`.

A `release` of a handle that does not stand is not refused but answered
`not_standing`, naming the handle. A `release` of a fixture the app ended itself
is answered `ended`, naming the handle and the app's reason.

A `perform` may carry `requester_name`, the requester's name for a person to
read. No check reads it: `input.json` holds that a sequence resolves and is
refused the same with it as without it.

A navigation to a position the app has dropped is not refused but answered
`unavailable`, with the grade the app still holds the position at and the
oldest position it holds.

The shapes of the operations are in `../shapes.json`: each operation's argument and
answer shape, and each interface's fingerprint. An app in another language reads
them from there. A pin is FNV-1a (64 bit, in hex) over a spelling's canonical CBOR,
and an interface's fingerprint is FNV-1a over its operations' pins in order.
