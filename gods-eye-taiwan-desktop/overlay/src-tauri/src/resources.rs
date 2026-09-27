
use serde::Serialize;
use sysinfo::{Pid, System};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceSnapshot {
  system_memory_total: u64,
  system_memory_used: u64,
  swap_total: u64,
  swap_used: u64,
  process_memory: u64,
  process_virtual_memory: u64,
  gpu_name: Option<String>,
  gpu_total: u64,
  gpu_used: u64,
  process_gpu_used: u64,
  gpu_process_is_exact: bool,
}

#[tauri::command]
pub fn resource_snapshot() -> Result<ResourceSnapshot, String> {
  let mut sys = System::new_all();
  sys.refresh_all();
  let pid = sysinfo::get_current_pid().map_err(|e| e.to_string())?;
  let process = sys.process(pid);
  let (process_memory, process_virtual_memory) = process
    .map(|p| (p.memory(), p.virtual_memory()))
    .unwrap_or((0, 0));

  let gpu = hypomnesis::Snapshot::now(0).ok();
  let (gpu_name, gpu_total, gpu_used) = gpu.as_ref().and_then(|s| s.gpu_device.as_ref())
    .map(|d| (d.name.clone(), d.total_bytes, d.used_bytes))
    .unwrap_or((None, 0, 0));
  let (process_gpu_used, gpu_process_is_exact) = gpu.as_ref().and_then(|s| s.gpu.as_ref())
    .map(|g| (g.used_bytes, g.is_per_process))
    .unwrap_or((0, false));

  Ok(ResourceSnapshot {
    system_memory_total: sys.total_memory(),
    system_memory_used: sys.used_memory(),
    swap_total: sys.total_swap(),
    swap_used: sys.used_swap(),
    process_memory,
    process_virtual_memory,
    gpu_name,
    gpu_total,
    gpu_used,
    process_gpu_used,
    gpu_process_is_exact,
  })
}
