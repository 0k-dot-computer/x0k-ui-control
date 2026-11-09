# x0k-runtime-dir: a stack's own runtime directory

```turtle folio:document
implementation:tooling\/runtime-dir a x0k:Implementation ;
    x0k:status "draft" ;
    x0k:summary "x0k-runtime-dir: the leaf that resolves a stack's runtime directory, where its sockets live, from the data root, the profile and the pin the environment carries, and keeps a scratch process out of the live root's runtime. It depends on nothing heavier than dirs, so a crate outside the root workspace, such as the Tauri plugin, binds by the same rule as x0k's own processes." ;
    x0k:concerns "runtime-dir", "profiles", "operator-root", "scratch", "tooling" ;
    x0k:motivatedBy intent:4ef693d1-1097-caa4-1f30-35da1af42165 ;
    folio:tangleCrate "crates/x0k-runtime-dir" ;
    folio:tangleRoot "src/lib.rs" .
```

Every x0k stack keeps its sockets in a **runtime directory**: a short path on
tmpfs, one per profile, that a driver can list to find what is running. The
rule that resolves it reads only the environment and two small files, so it
belongs below everything that uses it. This crate is that rule's one home.

It sits under `x0k-env`, which re-exports it, for the reason
`x0k-test-process` does (`x0k:implementation/tooling/test-process`): a crate
that cannot take `x0k-env` still needs the answer. The Tauri plugin
(`x0k:implementation/ui-control/tauri-plugin`) is a Cargo workspace of its
own, and `x0k-env` cannot resolve there. `x0k-env` needs `toml_edit` 0.22,
which needs `toml_datetime` 0.6.5 or later, and Tauri's GTK 3 stack pins
`toml_datetime` to 0.6.3 through glib-macros 0.18 and `proc-macro-crate`
2.0.2. Cargo allows one `toml_datetime` 0.6, so the two cannot meet. This
crate depends on `dirs`, `libc`, `thiserror`, `tracing` and
`x0k-test-process`, and nothing else.

<a name="chunk-manifest"></a><sub>[`Cargo.toml`](../../crates/x0k-runtime-dir/Cargo.toml) · `#manifest`</sub>

```toml {#manifest file="Cargo.toml"}
[package]
name = "x0k-runtime-dir"
version = "0.1.0"
edition = { workspace = true }
license = "MIT"
description = "A stack's own runtime directory: resolved from the data root, the profile and the pin, never into the live root's for a scratch process."
repository = "https://github.com/0k-dot-computer/x0k-ui-control"
readme = "../../README.md"
keywords = ["ui", "testing", "automation", "agents", "protocol"]

[dependencies]
# The home directory behind the data root when no variable names it.
dirs = { workspace = true }
thiserror = { workspace = true }
tracing = { workspace = true }
# The operator's root, which says which root is the live one.
x0k-test-process = { path = "../x0k-test-process", version = "0.1.0" }

[target.'cfg(unix)'.dependencies]
# The uid behind /run/user/<uid> when no XDG_RUNTIME_DIR is set.
libc = "0.2"
```

<a name="chunk-lib"></a><sub>[`src/lib.rs`](../../crates/x0k-runtime-dir/src/lib.rs) · `#lib` · assembles [variables](#chunk-variables) · [root](#chunk-root) · [profile](#chunk-profile) · [runtime-dir](#chunk-runtime-dir) · [live-runtime](#chunk-live-runtime) · [own-runtime-dir](#chunk-own-runtime-dir) · [tests](#chunk-tests)</sub>

```rust {#lib file="src/lib.rs"}
//! A stack's own runtime directory, and what it is resolved from: the data
//! root, the profile, and the pin the environment carries. A scratch process
//! never resolves into the live root's runtime.

use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::sync::Once;

use tracing::warn;
use x0k_test_process::operator_root;

<<variables>>

<<root>>

<<profile>>

<<runtime-dir>>

<<live-runtime>>

<<own-runtime-dir>>

<<tests>>
```

## What the environment says

Three variables name a stack. Each has a canonical `X0K_` name and a legacy
`C0K_` one, read second. An empty value counts as unset, so a setter that lost
its value cannot pin `""`.

<a name="chunk-variables"></a><sub>[`src/lib.rs`](../../crates/x0k-runtime-dir/src/lib.rs) · `#variables`</sub>

```rust {#variables}
/// Relocates the whole data root: the value is the root, holding
/// `profiles/`, `identity/` and the rest, as `$HOME/.0k` does.
pub const ENV_HOME_CANONICAL: &str = "X0K_HOME";
/// The data root's legacy name, read after [`ENV_HOME_CANONICAL`].
pub const ENV_C0K_HOME: &str = "C0K_HOME";
/// Names this process's profile.
pub const ENV_PROFILE_CANONICAL: &str = "X0K_PROFILE";
/// The profile's legacy name, read after [`ENV_PROFILE_CANONICAL`].
pub const ENV_PROFILE: &str = "C0K_PROFILE";
/// Pins the runtime dir: the eval container and the NixOS module set it to
/// `/run/0k/<profile>`, and the dev shell entered on the live root pins the
/// live node's.
pub const ENV_RUNTIME_DIR_CANONICAL: &str = "X0K_RUNTIME_DIR";
/// The pin's legacy name, read after [`ENV_RUNTIME_DIR_CANONICAL`].
pub const ENV_C0K_RUNTIME_DIR: &str = "C0K_RUNTIME_DIR";
/// The file under a data root that names its active profile.
pub const ACTIVE_PROFILE_FILE: &str = "active-profile";
/// The profile a root runs when nothing names one.
pub const DEFAULT_PROFILE: &str = "main";

/// The first of `vars` set to a non-empty value.
fn first_set(vars: [&str; 2]) -> Option<OsString> {
    vars.into_iter().filter_map(std::env::var_os).find(|value| !value.is_empty())
}
```

The data root is the first variable set, else `$HOME/.0k`, else `/tmp/.0k`.
It is read afresh on every call. Every path under the root composes onto it,
so one variable moves a whole stack to a scratch root.

<a name="chunk-root"></a><sub>[`src/lib.rs`](../../crates/x0k-runtime-dir/src/lib.rs) · `#root`</sub>

```rust {#root}
/// The x0k data root: `$X0K_HOME`, then `$C0K_HOME`, then `$HOME/.0k`, then
/// `/tmp/.0k`. Read afresh on every call.
pub fn x0k_root() -> PathBuf {
    if let Some(root) = first_set([ENV_HOME_CANONICAL, ENV_C0K_HOME]) {
        return PathBuf::from(root);
    }
    dirs::home_dir().map(|home| home.join(".0k")).unwrap_or_else(|| PathBuf::from("/tmp/.0k"))
}
```

## The profile

A process's profile is the variable, else its root's `active-profile` file,
else `main`. `x0k-env`'s `active_profile_name` resolves it this way too, but
binds the answer for the life of the process and migrates a legacy layout
between the variable and the file. [`process_profile_name`] does neither: it
is for a process that is not x0k's own, such as an app that adopts the Tauri
plugin, and must not change the root it reads.

A profile name becomes a directory name, so it is checked before any path is
made from it.

<a name="chunk-profile"></a><sub>[`src/lib.rs`](../../crates/x0k-runtime-dir/src/lib.rs) · `#profile`</sub>

```rust {#profile}
/// The profile the environment names, trimmed, if it names one.
pub fn profile_from_env() -> Option<String> {
    let name = first_set([ENV_PROFILE_CANONICAL, ENV_PROFILE])?;
    let name = name.to_string_lossy().trim().to_string();
    (!name.is_empty()).then_some(name)
}

/// The profile `root`'s `active-profile` file names, trimmed, if it names one.
pub fn read_active_profile_file(root: &Path) -> Option<String> {
    let contents = std::fs::read_to_string(root.join(ACTIVE_PROFILE_FILE)).ok()?;
    let name = contents.trim();
    (!name.is_empty()).then(|| name.to_string())
}

/// This process's profile: the environment's, else the data root's active
/// one, else [`DEFAULT_PROFILE`]. Read afresh; it binds nothing and writes
/// nothing.
pub fn process_profile_name() -> String {
    profile_from_env()
        .or_else(|| read_active_profile_file(&x0k_root()))
        .unwrap_or_else(|| DEFAULT_PROFILE.to_string())
}

/// Check a profile name: ASCII letters, digits, hyphens and underscores, at
/// most 64 of them, not empty, and neither starting nor ending with a hyphen.
pub fn validate_profile_name(name: &str) -> Result<(), ProfileNameError> {
    if name.is_empty() {
        return Err(ProfileNameError::Empty);
    }
    if name.len() > 64 {
        return Err(ProfileNameError::TooLong(name.len()));
    }
    if name.starts_with('-') || name.ends_with('-') {
        return Err(ProfileNameError::InvalidFormat("must not start or end with a hyphen".into()));
    }
    if !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err(ProfileNameError::InvalidFormat(
            "must contain only alphanumeric characters, hyphens, or underscores".into(),
        ));
    }
    Ok(())
}

/// Why a profile name was refused.
#[derive(Debug, thiserror::Error)]
pub enum ProfileNameError {
    #[error("profile name must not be empty")]
    Empty,
    #[error("profile name too long ({0} chars, max 64)")]
    TooLong(usize),
    #[error("invalid profile name: {0}")]
    InvalidFormat(String),
}
```

## The runtime dir

A profile's runtime dir is the pin when one is set, else the dir it
**derives**: `$XDG_RUNTIME_DIR/x0k/<profile>`. A process a daemon spawned may
carry no `XDG_RUNTIME_DIR`, and falling straight to `/tmp` would split the
socket namespace from the interactive shells', so it derives the per-user
`/run/user/<uid>` first when that exists.

<a name="chunk-runtime-dir"></a><sub>[`src/lib.rs`](../../crates/x0k-runtime-dir/src/lib.rs) · `#runtime-dir`</sub>

```rust {#runtime-dir}
/// The runtime dir the environment pins, if it pins one.
pub fn explicit_runtime_dir() -> Option<PathBuf> {
    first_set([ENV_RUNTIME_DIR_CANONICAL, ENV_C0K_RUNTIME_DIR]).map(PathBuf::from)
}

/// `profile_name`'s runtime dir: the pin, else [`derived_runtime_dir`].
/// Created on every call. A tool that finds or binds a stack's sockets for a
/// scratch profile or root uses [`own_runtime_dir`] instead, which never
/// resolves into the live root's runtime that the dev shell pins.
///
/// Panics on a name [`validate_profile_name`] refuses.
pub fn runtime_dir(profile_name: &str) -> PathBuf {
    let derived = derived_runtime_dir(profile_name);
    let dir = explicit_runtime_dir().unwrap_or(derived);
    ensure_runtime_dir(&dir);
    dir
}

/// The runtime dir `profile_name` derives with no pin:
/// `$XDG_RUNTIME_DIR/x0k/<profile>`, else under `/run/user/<uid>` when that
/// exists, else under `/tmp`. Not created.
///
/// Panics on a name [`validate_profile_name`] refuses.
pub fn derived_runtime_dir(profile_name: &str) -> PathBuf {
    if let Err(e) = validate_profile_name(profile_name) {
        panic!("runtime_dir: invalid profile name {profile_name:?}: {e}");
    }
    #[cfg(unix)]
    let fallback = || {
        // SAFETY: getuid takes no arguments, cannot fail and touches no memory.
        let uid_run = format!("/run/user/{}", unsafe { libc::getuid() });
        if Path::new(&uid_run).is_dir() {
            uid_run
        } else {
            "/tmp".to_string()
        }
    };
    // Windows has no XDG and no /run; the temp dir is the honest floor.
    #[cfg(not(unix))]
    let fallback = || std::env::temp_dir().to_string_lossy().into_owned();
    let xdg = std::env::var("XDG_RUNTIME_DIR").ok().unwrap_or_else(fallback);
    PathBuf::from(xdg).join("x0k").join(profile_name)
}

/// Create a runtime dir, warning rather than failing when it cannot be.
fn ensure_runtime_dir(dir: &Path) {
    if let Err(e) = std::fs::create_dir_all(dir) {
        warn!(path = %dir.display(), error = %e, "failed to create profile runtime dir (continuing)");
    }
}
```

## The live root's runtime, and a scratch process

The dev shell entered on the live root pins `X0K_RUNTIME_DIR` to the live
node's `/run/0k/<profile>`, and a process started from it for a scratch profile
or a scratch `X0K_HOME` inherits the pin. A tool that found or bound sockets by
[`runtime_dir`] would then meet the live stack's: a driver for a scratch shell
would list and act on the live shell, and a scratch app would bind beside it.

A process is **scratch** when its root is not the live root (the operator's
root, `~/.0k`) or its profile is not the live root's active one. The live
root's runtime is its active profile's system dir, `/run/0k/<active>` (the
NixOS module's), and its derived dir, `$XDG_RUNTIME_DIR/x0k/<active>`.

<a name="chunk-live-runtime"></a><sub>[`src/lib.rs`](../../crates/x0k-runtime-dir/src/lib.rs) · `#live-runtime`</sub>

```rust {#live-runtime}
/// The system runtime base the NixOS module's per-profile dirs live under.
const SYSTEM_RUNTIME_BASE: &str = "/run/0k";

/// The live root's runtime dirs on this host.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LiveRuntime {
    system: PathBuf,
    derived: PathBuf,
}

impl LiveRuntime {
    /// The runtime of the live root's active profile `live_profile`, whose
    /// derived dir is `derived`.
    pub fn new(live_profile: &str, derived: PathBuf) -> Self {
        Self { system: Path::new(SYSTEM_RUNTIME_BASE).join(live_profile), derived }
    }

    /// The live root's runtime as this host resolves it now.
    pub fn of_this_host() -> Self {
        let profile = live_profile_name();
        let derived = derived_runtime_dir(&profile);
        Self::new(&profile, derived)
    }

    /// Whether `dir` is, or lies inside, one of the live root's runtime dirs.
    pub fn holds(&self, dir: &Path) -> bool {
        dir.starts_with(&self.system) || dir.starts_with(&self.derived)
    }
}

/// The live root's active profile: the operator root's `active-profile`
/// file, else the default. Never reads `X0K_PROFILE`, which names this
/// process's profile, not the live root's.
pub fn live_profile_name() -> String {
    operator_root()
        .and_then(|root| read_active_profile_file(&root))
        .unwrap_or_else(|| DEFAULT_PROFILE.to_string())
}

/// Whether a process on `profile_name` is a scratch one: its root is not the
/// live root, or its profile is not the live root's active one.
pub fn is_scratch_process(profile_name: &str) -> bool {
    !is_live_root(&x0k_root()) || profile_name != live_profile_name()
}

fn is_live_root(root: &Path) -> bool {
    let Some(live) = operator_root() else { return false };
    root == live || matches!((root.canonicalize(), live.canonicalize()), (Ok(a), Ok(b)) if a == b)
}
```

A scratch process drops a pin inside the live root's runtime for its own
derived dir. A scratch root on the live profile's name derives the live dir,
so its own is that dir's sibling tagged with the root, `<derived>-<root tag>`:
the same for every process on that root, and never the live one. A pin to any
other dir is deliberate and kept: a scratch runtime a caller chose, or another
profile's own system dir. The live stack resolves exactly as [`runtime_dir`]
does. `tools/ui-headless` applies the same rule on the launcher's side, and
refuses a scratch root on the live profile's name outright.

<a name="chunk-own-runtime-dir"></a><sub>[`src/lib.rs`](../../crates/x0k-runtime-dir/src/lib.rs) · `#own-runtime-dir`</sub>

```rust {#own-runtime-dir}
/// The runtime dir of `profile_name`'s own stack.
///
/// The live stack resolves as [`runtime_dir`] does. A scratch process keeps
/// a pin outside the live root's runtime, drops one inside it for its derived
/// dir, and takes the root-tagged sibling of that dir when it is the live
/// one. Created like [`runtime_dir`]'s.
///
/// Panics on a name [`validate_profile_name`] refuses.
pub fn own_runtime_dir(profile_name: &str) -> PathBuf {
    let derived = derived_runtime_dir(profile_name);
    let scratch = is_scratch_process(profile_name);
    let live = scratch.then(LiveRuntime::of_this_host);
    let dir = choose(profile_name, live.as_ref(), explicit_runtime_dir(), derived, &x0k_root());
    ensure_runtime_dir(&dir);
    dir
}

/// The decision [`own_runtime_dir`] makes, over its inputs: `live` is the
/// live root's runtime when the process is a scratch one, `None` for the live
/// stack; `root` is the process's data root.
fn choose(profile_name: &str, live: Option<&LiveRuntime>, pin: Option<PathBuf>, derived: PathBuf, root: &Path) -> PathBuf {
    let Some(live) = live else {
        return pin.unwrap_or(derived);
    };
    if let Some(pin) = pin {
        if !live.holds(&pin) {
            return pin;
        }
        static DROPPED: Once = Once::new();
        DROPPED.call_once(|| {
            warn!(
                pin = %pin.display(),
                profile = profile_name,
                "not using {ENV_RUNTIME_DIR_CANONICAL}, the live root's runtime; a scratch profile resolves its own"
            );
        });
    }
    if live.holds(&derived) {
        return derived.with_file_name(format!("{profile_name}-{}", root_tag(root)));
    }
    derived
}

/// A short tag naming a data root: 64-bit FNV-1a over its path bytes, as hex.
/// Stable across builds, so every process on one root agrees on it.
fn root_tag(root: &Path) -> String {
    let hash = root.as_os_str().as_encoded_bytes().iter().fold(0xcbf2_9ce4_8422_2325_u64, |hash, byte| {
        (hash ^ u64::from(*byte)).wrapping_mul(0x0000_0100_0000_01b3)
    });
    format!("{hash:016x}")
}
```

## What holds it

The decision is a function of its inputs, so the tests hold it over them,
with no environment touched: the live stack keeps its pin; a scratch process
drops a pin inside the live runtime, at its root or below it, and keeps one
outside; and a scratch root on the live profile's name gets a dir of its own
that every process on that root agrees on and no other root shares.

<a name="chunk-tests"></a><sub>[`src/lib.rs`](../../crates/x0k-runtime-dir/src/lib.rs) · `#tests`</sub>

```rust {#tests}
#[cfg(test)]
mod tests {
    use super::*;

    const ROOT: &str = "/scratch/home";

    fn live() -> LiveRuntime {
        LiveRuntime::new("main", PathBuf::from("/xdg/x0k/main"))
    }

    fn scratch(profile: &str, pin: Option<&str>, derived: &str) -> PathBuf {
        choose(profile, Some(&live()), pin.map(PathBuf::from), derived.into(), Path::new(ROOT))
    }

    #[test]
    fn the_live_stack_keeps_its_pin_and_its_derived_dir() {
        let root = Path::new("/home/op/.0k");
        assert_eq!(choose("main", None, Some("/run/0k/main".into()), "/xdg/x0k/main".into(), root), PathBuf::from("/run/0k/main"));
        assert_eq!(choose("main", None, None, "/xdg/x0k/main".into(), root), PathBuf::from("/xdg/x0k/main"));
    }

    #[test]
    fn a_scratch_process_drops_a_pin_inside_the_live_runtime_for_its_own_derived_dir() {
        for pin in ["/run/0k/main", "/run/0k/main/", "/run/0k/main/ui-control", "/xdg/x0k/main"] {
            assert_eq!(scratch("probe", Some(pin), "/xdg/x0k/probe"), PathBuf::from("/xdg/x0k/probe"), "pin {pin}");
        }
    }

    #[test]
    fn a_scratch_process_keeps_a_pin_outside_the_live_runtime() {
        for pin in ["/tmp/scratch-run", "/run/0k/eval", "/xdg/x0k/probe", "/run/0k/main-scratch"] {
            assert_eq!(scratch("probe", Some(pin), "/xdg/x0k/probe"), PathBuf::from(pin), "pin {pin}");
        }
    }

    #[test]
    fn a_scratch_root_on_the_live_profile_name_gets_a_dir_of_its_own_tagged_by_its_root() {
        let own = scratch("main", Some("/run/0k/main"), "/xdg/x0k/main");
        assert!(!live().holds(&own), "{} is the live runtime", own.display());
        assert_eq!(own.parent(), Some(Path::new("/xdg/x0k")));
        assert_eq!(own, scratch("main", None, "/xdg/x0k/main"), "every process on the root agrees");
        let other = choose("main", Some(&live()), None, "/xdg/x0k/main".into(), Path::new("/scratch/other"));
        assert_ne!(own, other, "two scratch roots on the live name stay apart");
        assert_eq!(scratch("main", Some("/tmp/scratch-run"), "/xdg/x0k/main"), PathBuf::from("/tmp/scratch-run"));
    }
}
```
