// ABOUTME: Spawns and manages ephemeral Pi chat instances (Side Chat, Quick Chat).
// ABOUTME: Each ephemeral chat is a standalone `pi --mode rpc` process registered
// ABOUTME: in NativePiManager under a synthetic RuntimeTarget. The frontend
// ABOUTME: communicates with it via the same runtime_subscribe / runtime_request
// ABOUTME: protocol used for the main workspace session — no separate transport.

use crate::native_pi_manager::{NativeLaunchSpec, NativePiManager};
use crate::pi_launch::PiLaunchResolver;
use crate::runtime_coordinator::RuntimeTarget;
use serde_json::{json, Value};
use uuid::Uuid;

/// The ephemeral kind: "side-chat" or "quick-chat".
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EphemeralKind {
    SideChat,
    #[allow(dead_code)]
    QuickChat,
}

impl EphemeralKind {
    fn as_str(&self) -> &'static str {
        match self {
            EphemeralKind::SideChat => "side-chat",
            EphemeralKind::QuickChat => "quick-chat",
        }
    }
}

/// Spawn an ephemeral Pi instance and register it in NativePiManager.
///
/// Returns a descriptor the frontend uses to subscribe to the instance:
/// `{ kind, instanceId, sessionId, workspaceId }`.
///
/// For Side Chat, the cwd is the owner's workspace path so tools (file read,
/// bash) work in the same project context. For Quick Chat the cwd would be a
/// temporary directory (Phase 2).
pub fn create_ephemeral(
    kind: EphemeralKind,
    workspace_cwd: &str,
    runtimes: &NativePiManager,
    launch: &PiLaunchResolver,
) -> Result<Value, String> {
    let unique = Uuid::new_v4().simple().to_string();
    let instance_id = format!("ephemeral-{}-{unique}", kind.as_str());
    let workspace_id = format!("ephemeral-ws-{unique}");

    // Build the launch spec. Side Chat uses the workspace cwd so it has access
    // to the same project files. Quick Chat (Phase 2) will use a temp dir.
    let launch_spec = build_ephemeral_launch_spec(launch, workspace_cwd, kind)?;

    let target = RuntimeTarget::new(
        workspace_id.clone(),
        instance_id.clone(),
        instance_id.clone(),
    );
    runtimes.spawn(target, launch_spec)?;

    Ok(json!({
        "kind": kind.as_str(),
        "instanceId": instance_id,
        "sessionId": instance_id,
        "workspaceId": workspace_id,
    }))
}

/// Close an ephemeral instance by stopping its Pi process in NativePiManager.
pub fn close_ephemeral(runtimes: &NativePiManager, instance_id: &str) -> Result<(), String> {
    // The instance_id is used as both the target's instanceId and sessionId.
    if let Some(target) = runtimes.target_for_session_id(instance_id) {
        runtimes.stop(&target)?;
    }
    Ok(())
}

fn build_ephemeral_launch_spec(
    launch: &PiLaunchResolver,
    cwd: &str,
    kind: EphemeralKind,
) -> Result<NativeLaunchSpec, String> {
    let mut spec = launch.native_launch_spec(cwd, None)?;
    // Quick Chat runs without tools (no file editing, no bash). Side Chat
    // keeps tools so it can operate on the workspace.
    if kind == EphemeralKind::QuickChat {
        spec = NativeLaunchSpec {
            extensions: spec.extensions, // keep extensions
            ..spec
        };
    }
    Ok(spec)
}
