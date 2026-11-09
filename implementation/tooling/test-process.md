# x0k-test-process: whether this process is a test's

```turtle folio:document
implementation:tooling\/test-process a x0k:Implementation ;
    x0k:status "draft" ;
    x0k:summary "x0k-test-process: the leaf that says whether this process is a test's, where a cargo test binary's profile directory is, and where the operator's x0k root is, so a guard in any crate, however lean, can keep a test off the operator's live state." ;
    x0k:concerns "testing", "guards", "operator-root", "tooling" ;
    x0k:motivatedBy intent:1e9de23d-ca50-04e8-970f-7d8a63445716 ;
    folio:tangleCrate "crates/x0k-test-process" ;
    folio:tangleRoot "src/lib.rs" .
```

A test must not write into the operator's live state, and the code that
would do the writing usually lives in a dependency of the crate under test.
`x0k-ui`'s test binary mounts a real wasm guest through
`x0k_surface_build::build_surface`, and that call moves a pointer in the
surface cache a running shell reads. `cfg!(test)` cannot help:
`x0k-surface-build` is compiled as a plain library for that binary. So the
guard asks a question of the running process, at run time.

This crate is the one answer to that question. It sits under `x0k-env`,
which re-exports it, because the guard that needs it most sits below
`x0k-env`: `x0k-surface-build` is in the tangler's closure, and the tangler
stays free of `x0k-env`'s tree of tokio, config and file watchers. It holds
no state of its own beyond a cached answer, and it depends on nothing but
`dirs`.

<a name="chunk-manifest"></a><sub>[`Cargo.toml`](../../crates/x0k-test-process/Cargo.toml) · `#manifest`</sub>

```toml {#manifest file="Cargo.toml"}
[package]
name = "x0k-test-process"
version = "0.1.0"
edition = { workspace = true }
license = "MIT"
description = "Whether this process is a test's, where a cargo test binary's profile directory is, and where the operator's x0k root is."
repository = "https://github.com/0k-dot-computer/x0k-ui-control"
readme = "../../README.md"
keywords = ["ui", "testing", "automation", "agents", "protocol"]

[dependencies]
# The home directory behind `operator_root`; `$HOME` is not set on every platform.
dirs = "5.0"
```

## The contract

Take `x0k-ui`'s test binary, at
`target/debug/build/x0k-ui/1ba325aad6013055/out/x0k_ui-1ba325aad6013055`.
Run with no marker in its environment, it is a test process
([`is_test_process`] answers yes), its cargo profile directory is
`target/debug` ([`cargo_profile_dir`]), and a path under `$HOME/.0k` is under
the operator's root ([`under_operator_root`]) whatever `X0K_HOME` says.

A process is a test's when it says so or when its own path says so. Saying
so is the marker [`ENV_TEST_PROCESS`]: harnesses that spawn test binaries set
it, and `x0k_env::profile::rebind_for_tests` sets it in-process. A plain
`cargo test` sets nothing, so the binary's path is the answer there. A binary
target runs from its uplifted `<profile>/<name>`, with no hash, and a build
script is `build-script-build`; neither is a test.

<a name="chunk-lib"></a><sub>[`src/lib.rs`](../../crates/x0k-test-process/src/lib.rs) · `#lib` · assembles [marker](#chunk-marker) · [test-process](#chunk-test-process) · [profile-dir](#chunk-profile-dir) · [operator-root](#chunk-operator-root) · [tests](#chunk-tests)</sub>

```rust {#lib file="src/lib.rs"}
//! Whether this process is a test's, and where the operator's x0k root is:
//! the questions a guard asks to keep a test off the operator's live state.

use std::ffi::OsStr;
use std::path::{Path, PathBuf};

<<marker>>

<<test-process>>

<<profile-dir>>

<<operator-root>>

<<tests>>
```

<a name="chunk-marker"></a><sub>[`src/lib.rs`](../../crates/x0k-test-process/src/lib.rs) · `#marker`</sub>

```rust {#marker}
/// Environment marker that declares the current process a **test process**.
///
/// Set (to any non-empty value) by harnesses that spawn test binaries (the
/// servitor gate's per-process pool, a hermetic proof script) and by
/// `x0k_env::profile::rebind_for_tests` in-process, so a process that has
/// ever rebound its profile is a declared test process from then on. Read by
/// [`is_test_process`]. Production daemons never carry it, so it never gates
/// them.
pub const ENV_TEST_PROCESS: &str = "X0K_TEST_PROCESS";
```

<a name="chunk-test-process"></a><sub>[`src/lib.rs`](../../crates/x0k-test-process/src/lib.rs) · `#test-process`</sub>

```rust {#test-process}
/// Whether this is a test process: one declared so via [`ENV_TEST_PROCESS`],
/// or a cargo test binary, whatever crate it tests. A dependency crate's
/// guard cannot see the test crate's `cfg(test)`, and a plain `cargo test`
/// sets no marker, so the binary's own path is what says it is a test
/// ([`cargo_profile_dir`]).
pub fn is_test_process() -> bool {
    std::env::var_os(ENV_TEST_PROCESS).is_some_and(|value| !value.is_empty()) || is_cargo_test_binary()
}

fn is_cargo_test_binary() -> bool {
    static TEST_BINARY: std::sync::OnceLock<bool> = std::sync::OnceLock::new();
    *TEST_BINARY.get_or_init(|| std::env::current_exe().is_ok_and(|exe| cargo_profile_dir(&exe).is_some()))
}
```

## Where a test binary runs from

A guard that sends a test elsewhere wants somewhere stable to send it, and a
test binary already sits in a directory that belongs to this checkout's build
and goes away with it. The same two path shapes that say a binary is a test
also say which profile directory holds it, so one function answers both.

<a name="chunk-profile-dir"></a><sub>[`src/lib.rs`](../../crates/x0k-test-process/src/lib.rs) · `#profile-dir`</sub>

```rust {#profile-dir}
/// The cargo profile directory of a test binary at `exe`, `None` when `exe`
/// is not where cargo puts a test binary it runs: a file named
/// `<name>-<16 hex>` in `<profile>/deps/`, or, with the build dir's new
/// layout, in `<profile>/build/<package>/<the same 16 hex>/out/`. A binary
/// target runs from its uplifted `<profile>/<name>`, with no hash, and a build
/// script is `build-script-build`; neither matches.
pub fn cargo_profile_dir(exe: &Path) -> Option<&Path> {
    let hash = exe.file_stem()?.to_str()?.rsplit_once('-')?.1;
    if hash.len() != 16 || !hash.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return None;
    }
    let dirs: Vec<&Path> = exe.ancestors().skip(1).take(5).collect();
    let names: Vec<Option<&str>> = dirs.iter().map(|dir| dir.file_name().and_then(OsStr::to_str)).collect();
    match names.as_slice() {
        [Some("deps"), ..] => dirs.get(1).copied(),
        [Some("out"), Some(dir), _, Some("build"), ..] if *dir == hash => dirs.get(4).copied(),
        _ => None,
    }
}
```

## The operator's root

[`operator_root`] answers from the home directory alone. `x0k_env`'s
`x0k_root` answers "which root is this process running against", and
`X0K_HOME` moves that answer; this one stays put, because a process whose
`X0K_HOME` names the operator's root is exactly the case a guard must catch.
[`under_operator_root`] compares each path both as written and resolved, so a
symlinked home neither hides nor invents a match.

<a name="chunk-operator-root"></a><sub>[`src/lib.rs`](../../crates/x0k-test-process/src/lib.rs) · `#operator-root`</sub>

```rust {#operator-root}
/// The **operator's** x0k root: `$HOME/.0k`, resolved from the home directory
/// alone and deliberately blind to `X0K_HOME` / `C0K_HOME`.
///
/// `x0k_env::profile::x0k_root` answers "which root is this process running
/// against"; this answers "where does the operator's live substrate live on
/// this machine", which is the thing a scratch-redirected process must never
/// write into. `None` when there is no home directory at all.
pub fn operator_root() -> Option<PathBuf> {
    dirs::home_dir().map(|home| home.join(".0k"))
}

/// Whether `path` is the operator's root or lies under it, as written or
/// resolved, against both spellings of the root.
pub fn under_operator_root(path: &Path) -> bool {
    let Some(root) = operator_root() else { return false };
    let roots = [Some(root.clone()), root.canonicalize().ok()];
    let paths = [std::path::absolute(path).ok(), path.canonicalize().ok()];
    paths.iter().flatten().any(|path| roots.iter().flatten().any(|root| path.starts_with(root)))
}
```

## What the tests pin

The table is the two path shapes and their near misses. The second test
points the home directory at a temporary one, so the operator's root it
checks is that directory's `.0k` and nothing touches the real one. It runs
in this crate's only test binary with nothing else reading `HOME` while it
does.

<a name="chunk-tests"></a><sub>[`src/lib.rs`](../../crates/x0k-test-process/src/lib.rs) · `#tests`</sub>

```rust {#tests}
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cargo_test_binaries_are_recognised_by_their_path_and_daemons_are_not() {
        let profile = |path: &'static str| cargo_profile_dir(Path::new(path)).map(|dir| dir.to_str().unwrap());
        assert_eq!(profile("/w/target/debug/deps/x0k_env-0123456789abcdef"), Some("/w/target/debug"));
        assert_eq!(
            profile("/w/target/debug/build/x0k-env/0123456789abcdef/out/profile_allocation-0123456789abcdef"),
            Some("/w/target/debug")
        );
        assert_eq!(profile("C:/w/target/debug/deps/x0k_env-0123456789abcdef.exe"), Some("C:/w/target/debug"));
        assert_eq!(profile("/w/target/debug/x0kd"), None, "an uplifted binary target");
        assert_eq!(profile("/w/target/debug/build/x0k-env/0123456789abcdef/build-script-build"), None);
        assert_eq!(
            profile("/w/target/debug/build/x0k-env/0123456789abcdef/out/other-fedcba9876543210"),
            None,
            "the out dir's own hash"
        );
        assert_eq!(profile("/usr/local/bin/tool-0123456789abcdef"), None, "a hash-shaped name outside a target");
    }

    #[test]
    fn a_path_is_under_the_operator_root_however_it_is_spelled() {
        let home = std::env::temp_dir().join(format!("x0k-test-process-{}", std::process::id()));
        std::fs::create_dir_all(home.join(".0k/profiles/main")).unwrap();
        std::fs::create_dir_all(home.join("elsewhere")).unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(home.join(".0k"), home.join("elsewhere/link")).unwrap();
        std::env::set_var("HOME", &home);

        assert_eq!(operator_root(), Some(home.join(".0k")));
        assert!(under_operator_root(&home.join(".0k")));
        assert!(under_operator_root(&home.join(".0k/profiles/main")));
        #[cfg(unix)]
        assert!(under_operator_root(&home.join("elsewhere/link/profiles/main")), "a symlink to the root");
        assert!(!under_operator_root(&home.join("elsewhere")));
        assert!(!under_operator_root(&home.join(".0k-scratch")), "a sibling that shares the prefix");

        std::fs::remove_dir_all(&home).ok();
    }
}
```

Three guards ask these questions: the entry store's spine-writer tripwire,
the supervisor client's live-supervisor guard, and
`x0k_surface_build::profile_root`, which gives a test a root of its own in
place of the operator's. What is left open is reach: a production
binary that a test spawns without the marker is not a test process, because
its path says nothing and this crate does not walk its ancestors.
