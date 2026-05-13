#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  let mut builder = tauri::Builder::default();

  #[cfg(desktop)]
  {
    builder = builder.plugin(tauri_plugin_single_instance::init(|_app, _argv, _cwd| {
      // Deep-link events are forwarded by the plugin when single-instance is enabled.
    }));
  }

  builder
    .plugin(tauri_plugin_deep_link::init())
    .plugin(tauri_plugin_opener::init())
    .setup(|app| {
      #[cfg(any(windows, target_os = "linux"))]
      {
        use tauri_plugin_deep_link::DeepLinkExt;
        app.deep_link().register_all()?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
