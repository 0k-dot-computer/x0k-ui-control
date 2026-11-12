# Who allows a takeover: a host's configuration of its endpoint

```turtle folio:document
implementation:ui-control\/takeover a x0k:Implementation ;
    x0k:status "draft" ;
    x0k:summary "x0k-ui-endpoint's takeover configuration: a list of rules and a default answer (ask, allow, refuse) that decides whether a driver's takeover, or a stepped screencast's hold, asks the person, holds without asking or is refused; one value every host builds its endpoint with." ;
    x0k:concerns "ui-control", "protocol", "publication" ;
    x0k:cites implementation:ui-control\/endpoint,
        implementation:ui-control\/tauri-plugin,
        implementation:ui-control\/shell-endpoint ;
    x0k:implements architecture:ui-control-channel,
        architecture:ui-interfaces ;
    x0k:motivatedBy intent:dabb635c-3f03-ce32-01d9-d959f22d44fc ;
    folio:tangleCrate "crates/x0k-ui-endpoint" ;
    folio:tangleRoot "src/takeover.rs" .
```

A takeover stops a person from using their own window, so by default the host
asks them first (`x0k:architecture/ui-control-channel` §10, "Who allows a
takeover"). Some hosts know better who is at the window. Chariot lets the
agents it runs in a loop take over its window whenever they ask; another host
refuses every takeover from a process it did not start. This chapter is the
one value that says which, the same on every host: a Tauri app hands it to the
plugin's builder (`x0k:implementation/ui-control/tauri-plugin`), and x0k's
shell reads it from `config/x0k-ui.toml`
(`x0k:implementation/ui-control/shell-endpoint`). The endpoint reads it
(`x0k:implementation/ui-control/endpoint`, "An app's end").

## What holds

- **The answer.** A configuration is a list of rules and a default. Each rule
  names what it matches and one answer: `ask`, `allow` or `refuse`. The first
  rule that matches answers; with none matching, the default does. A host that
  configures nothing asks.
- **What a rule reads.** The kind of hold, the grant the connection holds, the
  requester the connection names, and whether the app runs as a dev instance.
  Nothing else reaches the evaluation, so nothing a driver says of itself can
  pick its answer: `requester_name` is not in what a rule is asked about, and a
  configuration that names it does not read (`deny_unknown_fields`).
- **What a rule names, all of it.** A rule that names several things matches
  only when each holds. A rule that names nothing matches everything, which is
  how a host says "for everyone else" before its default.

The endpoint applies the answer; this chapter only decides it. What the person
sees is the same under every answer: the host shows the hold, naming the
requester and the exit input, and the exit ends it. That is the host's to
draw, not a rule's to turn off, so no field here touches it.

## The requester a rule reads

The requester is the one the connection names (`x0k:architecture/ui-interfaces`
§6): on a local socket the peer's user and process, as the kernel gave them when
it connected; on the daemon's connection the requester `on_behalf_of` names. The
endpoint fills `on_behalf_of` from no call yet, since no daemon connection forwards to
an app's endpoint today; a rule naming it matches no requester until one does.
It prints as the label the endpoint has always handed an app, `uid 501 pid 7`, so
a host that draws or asks with a requester's name reads the same words.

A host may match a requester against the processes it started itself. The host
knows those pids; the endpoint knows the peer's. A driver is often not the
process the host started but one that process started (an agent runs a driver
tool), so the peer matches when it, or any process above it, is one the host
says it started. On Linux the endpoint reads each parent from `/proc`; elsewhere
it asks about the peer alone.

## The configuration, as a file says it

The serde form is the shell's `[ui_control.takeover]` table, and it reads the
same from JSON:

```toml
[ui_control.takeover]
default = "ask"

[[ui_control.takeover.rules]]
when = { dev_instance = true }
answer = "allow"

[[ui_control.takeover.rules]]
when = { hold = "takeover", uid = 0 }
answer = "refuse"
```

`started_by_host` is a matcher a file may name, but only a host that says which
processes it started can make it true; in a host that says none, it matches no
requester. The predicate itself is code, so it is never read from a file.

<a name="chunk-takeover"></a><sub>[`src/takeover.rs`](../../crates/x0k-ui-endpoint/src/takeover.rs) · `#takeover`</sub>

```rust {#takeover file="src/takeover.rs"}
//! Who allows a takeover, or a stepped screencast's hold: a host's
//! configuration of its endpoint (`ui-control-channel` §10, "Who allows a
//! takeover").

use std::fmt;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use x0k_ui_protocol::act::Grant;
use x0k_ui_protocol::offer::SideEffect;

/// What holds the window.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HoldKind {
    /// A sequence's takeover (`ui/input`'s `takeover` option).
    Takeover,
    /// A stepped screencast's hold of the window (`ui-screencast` §5).
    SteppedScreencast,
}

/// What the configuration answers a hold.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HoldAnswer {
    /// Ask the person, who has the host's wait to answer.
    #[default]
    Ask,
    /// Hold the window without asking.
    Allow,
    /// Refuse the hold as `takeover_not_granted`, asking no one.
    Refuse,
}

/// The requester a connection names (`ui-interfaces` §6).
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Requester {
    /// The peer's user, on a local socket.
    pub uid: Option<u32>,
    /// The peer's process, on a local socket.
    pub pid: Option<u32>,
    /// The requester a call the daemon forwards names, on the daemon's connection.
    pub on_behalf_of: Option<String>,
}

impl Requester {
    /// The peer `uid`, and its process when the kernel names one.
    pub fn peer(uid: u32, pid: Option<u32>) -> Self {
        Requester { uid: Some(uid), pid, on_behalf_of: None }
    }

    /// The peer process and each process above it, nearest first, as far as
    /// the host can see; the peer alone where it cannot read parents.
    fn lineage(&self) -> Vec<u32> {
        let mut lineage = Vec::new();
        let mut next = self.pid;
        while let Some(pid) = next.filter(|pid| *pid > 1 && !lineage.contains(pid)) {
            lineage.push(pid);
            next = parent_of(pid);
        }
        lineage
    }
}

/// The parent of `pid`, from the fourth field of `/proc/<pid>/stat`, after the
/// command name's closing parenthesis.
#[cfg(target_os = "linux")]
fn parent_of(pid: u32) -> Option<u32> {
    let stat = std::fs::read_to_string(format!("/proc/{pid}/stat")).ok()?;
    let after = &stat[stat.rfind(')')? + 1..];
    after.split_whitespace().nth(1)?.parse().ok()
}

#[cfg(not(target_os = "linux"))]
fn parent_of(_pid: u32) -> Option<u32> {
    None
}

/// The label an app hears for the requester: the name `on_behalf_of` gives,
/// else the peer's credentials, else `unnamed`.
impl fmt::Display for Requester {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match (&self.on_behalf_of, self.uid, self.pid) {
            (Some(named), _, _) => f.write_str(named),
            (None, Some(uid), Some(pid)) => write!(f, "uid {uid} pid {pid}"),
            (None, Some(uid), None) => write!(f, "uid {uid}"),
            (None, None, _) => f.write_str(crate::server::UNNAMED),
        }
    }
}

/// What a rule matches. Each field it names must hold; a rule that names
/// none matches every hold. There is no field for `requester_name`, and a
/// configuration that names one does not read.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct HoldMatch {
    /// The kind of hold.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hold: Option<HoldKind>,
    /// The connection's grant allows this side-effect class.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub grant_allows: Option<SideEffect>,
    /// The peer's user.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub uid: Option<u32>,
    /// Whether the peer, or a process above it, is one the host started.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub started_by_host: Option<bool>,
    /// The requester a call the daemon forwards names.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub on_behalf_of: Option<String>,
    /// Whether the app runs as a dev instance (`ui-interfaces` §5).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dev_instance: Option<bool>,
}

/// One rule: what it matches and its answer.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct HoldRule {
    #[serde(default)]
    pub when: HoldMatch,
    pub answer: HoldAnswer,
}

/// Whether a pid is a process the host started itself.
pub type StartedByHost = Arc<dyn Fn(u32) -> bool + Send + Sync>;

/// A host's configuration of who allows a takeover: its rules, in order, and
/// its default. `TakeoverPolicy::default()` asks every time.
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TakeoverPolicy {
    #[serde(default)]
    pub rules: Vec<HoldRule>,
    #[serde(default)]
    pub default: HoldAnswer,
    /// The processes the host started itself; code, never a file's.
    #[serde(skip)]
    started_by_host: Option<StartedByHost>,
}

impl fmt::Debug for TakeoverPolicy {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("TakeoverPolicy")
            .field("rules", &self.rules)
            .field("default", &self.default)
            .field("started_by_host", &self.started_by_host.is_some())
            .finish()
    }
}

/// What the configuration is asked about one hold, and nothing else.
#[derive(Clone, Copy, Debug)]
pub struct HoldAsked<'a> {
    pub hold: HoldKind,
    pub grant: &'a Grant,
    pub requester: &'a Requester,
    pub dev_instance: bool,
}

impl TakeoverPolicy {
    /// Add a rule after the ones already there.
    pub fn rule(mut self, when: HoldMatch, answer: HoldAnswer) -> Self {
        self.rules.push(HoldRule { when, answer });
        self
    }

    /// Answer `answer` when no rule matches.
    pub fn otherwise(mut self, answer: HoldAnswer) -> Self {
        self.default = answer;
        self
    }

    /// Say which processes the host started itself, for `started_by_host`.
    pub fn started_by_host(mut self, started: impl Fn(u32) -> bool + Send + Sync + 'static) -> Self {
        self.started_by_host = Some(Arc::new(started));
        self
    }

    /// The answer of the first rule that matches `asked`, else the default.
    pub fn answer(&self, asked: &HoldAsked<'_>) -> HoldAnswer {
        let found = self.rules.iter().find(|rule| self.matches(&rule.when, asked));
        found.map_or(self.default, |rule| rule.answer)
    }

    fn matches(&self, when: &HoldMatch, asked: &HoldAsked<'_>) -> bool {
        let holds = |wanted: Option<bool>, is: &dyn Fn() -> bool| wanted.is_none_or(|wanted| wanted == is());
        when.hold.is_none_or(|hold| hold == asked.hold)
            && when.grant_allows.is_none_or(|class| asked.grant.classes.contains(&class))
            && when.uid.is_none_or(|uid| asked.requester.uid == Some(uid))
            && when.on_behalf_of.as_deref().is_none_or(|named| asked.requester.on_behalf_of.as_deref() == Some(named))
            && holds(when.dev_instance, &|| asked.dev_instance)
            && holds(when.started_by_host, &|| self.started(asked.requester))
    }

    /// Whether the requester's process, or one above it, is one the host
    /// started; false in a host that says none.
    fn started(&self, requester: &Requester) -> bool {
        let Some(started) = &self.started_by_host else { return false };
        requester.lineage().into_iter().any(|pid| started(pid))
    }
}
```

## Holding it to the decision

The tests ask the configuration directly, through its public value, beside
the module so the crate links no more test binaries: the
endpoint's own tests (`x0k:implementation/ui-control/endpoint`) hold what the
endpoint does with each answer. The claims here are the evaluation's: nothing
configured asks; the first match wins over a later one and over the default; a
rule names several things and matches only when all hold; a process a host
started matches through its children; and a file naming `requester_name` does
not read.

<a name="chunk-takeover-test"></a><sub>[`src/takeover.rs`](../../crates/x0k-ui-endpoint/src/takeover.rs) · `#takeover-test`</sub>

```rust {#takeover-test file="src/takeover.rs"}

/// The configuration's answer, rule by rule.
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn asked<'a>(hold: HoldKind, grant: &'a Grant, requester: &'a Requester) -> HoldAsked<'a> {
        HoldAsked { hold, grant, requester, dev_instance: false }
    }

    #[test]
    fn nothing_configured_asks() {
        let (grant, requester) = (Grant { classes: vec![] }, Requester::peer(501, Some(7)));
        let policy = TakeoverPolicy::default();
        assert_eq!(policy.answer(&asked(HoldKind::Takeover, &grant, &requester)), HoldAnswer::Ask);
        assert_eq!(policy.answer(&asked(HoldKind::SteppedScreencast, &grant, &requester)), HoldAnswer::Ask);
        let read: TakeoverPolicy = serde_json::from_value(json!({})).expect("an empty table reads");
        assert_eq!(read.answer(&asked(HoldKind::Takeover, &grant, &requester)), HoldAnswer::Ask);
    }

    #[test]
    fn the_first_rule_that_matches_answers() {
        let (grant, requester) = (Grant { classes: vec![SideEffect::ReadOnly] }, Requester::peer(501, Some(7)));
        let policy = TakeoverPolicy::default()
            .rule(HoldMatch { uid: Some(501), ..HoldMatch::default() }, HoldAnswer::Allow)
            .rule(HoldMatch::default(), HoldAnswer::Refuse)
            .otherwise(HoldAnswer::Ask);
        assert_eq!(policy.answer(&asked(HoldKind::Takeover, &grant, &requester)), HoldAnswer::Allow);
        let other = Requester::peer(502, Some(7));
        assert_eq!(policy.answer(&asked(HoldKind::Takeover, &grant, &other)), HoldAnswer::Refuse, "the catch-all comes second");
    }

    #[test]
    fn a_rule_matches_only_when_everything_it_names_holds() {
        let requester = Requester::peer(501, Some(7));
        let when = HoldMatch {
            hold: Some(HoldKind::SteppedScreencast),
            grant_allows: Some(SideEffect::NonIdempotent),
            dev_instance: Some(true),
            ..HoldMatch::default()
        };
        let policy = TakeoverPolicy::default().rule(when, HoldAnswer::Allow).otherwise(HoldAnswer::Refuse);
        let every = Grant { classes: vec![SideEffect::ReadOnly, SideEffect::NonIdempotent] };
        let reads = Grant { classes: vec![SideEffect::ReadOnly] };
        let dev = |hold, grant| HoldAsked { hold, grant, requester: &requester, dev_instance: true };
        assert_eq!(policy.answer(&dev(HoldKind::SteppedScreencast, &every)), HoldAnswer::Allow);
        assert_eq!(policy.answer(&dev(HoldKind::Takeover, &every)), HoldAnswer::Refuse, "another kind of hold");
        assert_eq!(policy.answer(&dev(HoldKind::SteppedScreencast, &reads)), HoldAnswer::Refuse, "a narrower grant");
        let live = HoldAsked { dev_instance: false, ..dev(HoldKind::SteppedScreencast, &every) };
        assert_eq!(policy.answer(&live), HoldAnswer::Refuse, "not a dev instance");
    }

    #[test]
    fn a_process_the_host_started_matches_through_its_children() {
        let grant = Grant { classes: vec![] };
        let parent = std::process::id();
        let child = std::process::Command::new("sleep").arg("5").spawn().expect("a child process");
        let started_by_host = HoldMatch { started_by_host: Some(true), ..HoldMatch::default() };
        let policy = TakeoverPolicy::default()
            .rule(started_by_host, HoldAnswer::Allow)
            .otherwise(HoldAnswer::Refuse)
            .started_by_host(move |pid| pid == parent);
        let driver = Requester::peer(0, Some(child.id()));
        let answer = policy.answer(&asked(HoldKind::Takeover, &grant, &driver));
        let stranger = Requester::peer(0, Some(1));
        let refused = policy.answer(&asked(HoldKind::Takeover, &grant, &stranger));
        let mut child = child;
        let _ = child.kill();
        let _ = child.wait();
        #[cfg(target_os = "linux")]
        assert_eq!(answer, HoldAnswer::Allow, "a child of a process the host started");
        assert_eq!(refused, HoldAnswer::Refuse, "a process the host did not start");
    }

    #[test]
    fn a_configuration_naming_requester_name_does_not_read() {
        let named = json!({ "rules": [{ "when": { "requester_name": "Apollo" }, "answer": "allow" }] });
        let error = serde_json::from_value::<TakeoverPolicy>(named).expect_err("requester_name is no matcher");
        assert!(error.to_string().contains("requester_name"), "{error}");
        let read: TakeoverPolicy = serde_json::from_value(json!({
            "default": "refuse",
            "rules": [{ "when": { "hold": "stepped_screencast", "uid": 501 }, "answer": "allow" }],
        }))
        .expect("a table of matchers reads");
        assert_eq!(read.default, HoldAnswer::Refuse);
        assert_eq!(read.rules[0].when.hold, Some(HoldKind::SteppedScreencast));
    }
}
```
