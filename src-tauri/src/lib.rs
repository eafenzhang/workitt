#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;
mod clipboard;
mod crypto;

use db::{DbState, handle_db_query, handle_upload};
use clipboard::{tauri_read_clipboard_images, tauri_read_clipboard_text, tauri_read_clipboard_html, tauri_read_clipboard_files, tauri_read_local_file};

use std::sync::Mutex;
use tauri::{Manager, AppHandle, Wry, Emitter, WebviewWindowBuilder, WebviewUrl};
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState};
use log::{info, error};

pub struct AppState {
    pub db: Mutex<DbState>,
    pub minimize_to_tray: Mutex<bool>,
}

static QC_WINDOW: std::sync::OnceLock<std::sync::Mutex<Option<tauri::WebviewWindow<Wry>>>> = std::sync::OnceLock::new();
fn get_qc_window() -> &'static std::sync::Mutex<Option<tauri::WebviewWindow<Wry>>> {
    QC_WINDOW.get_or_init(|| std::sync::Mutex::new(None))
}

#[tauri::command]
fn get_version(app: AppHandle<Wry>) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
fn window_minimize(window: tauri::Window<Wry>) {
    let _ = window.minimize();
}

#[tauri::command]
fn window_maximize(window: tauri::Window<Wry>) {
    if window.is_maximized().unwrap_or(false) {
        let _ = window.unmaximize();
    } else {
        let _ = window.maximize();
    }
}

#[tauri::command]
fn window_close(window: tauri::Window<Wry>) {
    let _ = window.close();
}

#[tauri::command]
fn window_is_maximized(window: tauri::Window<Wry>) -> bool {
    window.is_maximized().unwrap_or(false)
}

#[tauri::command]
fn db_query(
    state: tauri::State<'_, AppState>,
    method: String,
    table: String,
    args: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    Ok(handle_db_query(&db, &method, &table, args))
}

#[tauri::command]
fn db_upload(
    state: tauri::State<'_, AppState>,
    table: String,
    file_data: Vec<u8>,
) -> Result<serde_json::Value, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    handle_upload(&db, &table, file_data)
}

#[tauri::command]
fn cmd_read_clipboard_images() -> Vec<String> {
    tauri_read_clipboard_images()
}

#[tauri::command]
fn cmd_read_clipboard_text() -> String {
    tauri_read_clipboard_text()
}

#[tauri::command]
fn cmd_read_clipboard_html() -> String {
    tauri_read_clipboard_html()
}

#[tauri::command]
fn cmd_read_clipboard_files() -> Vec<String> {
    tauri_read_clipboard_files()
}

#[tauri::command]
fn cmd_read_local_file(file_path: String) -> Option<String> {
    tauri_read_local_file(&file_path)
}

#[tauri::command]
fn get_settings(state: tauri::State<'_, AppState>) -> serde_json::Value {
    let minimize_to_tray = *state.minimize_to_tray.lock().unwrap_or_else(|e| e.into_inner());
    serde_json::json!({
        "minimizeToTray": minimize_to_tray,
        "openAtLogin": false
    })
}

#[tauri::command]
fn set_minimize_to_tray(
    state: tauri::State<'_, AppState>,
    enabled: bool,
    app: AppHandle<Wry>,
) -> bool {
    let mut val = state.minimize_to_tray.lock().unwrap_or_else(|e| e.into_inner());
    *val = enabled;
    if enabled {
        let _ = setup_tray(&app);
    }
    enabled
}

#[tauri::command]
fn set_open_at_login(_enabled: bool) -> bool {
    false
}

#[tauri::command]
fn notify_requirements_changed(app: AppHandle<Wry>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.emit("requirements-changed", ());
    }
}

#[tauri::command]
fn test_model_connection(base_url: String, api_key: String, model_id: String) -> Result<bool, String> {
    use std::process::{Command, Stdio};

    let is_anthropic = base_url.contains("anthropic");
    let url = base_url.trim_end_matches('/').to_string();
    let target_url = if is_anthropic {
        format!("{}/v1/messages", url)
    } else {
        format!("{}/v1/chat/completions", url)
    };

    let body = if is_anthropic {
        serde_json::json!({
            "model": model_id,
            "messages": [{"role": "user", "content": "hi"}],
            "max_tokens": 5
        }).to_string()
    } else {
        serde_json::json!({
            "model": model_id,
            "messages": [{"role": "user", "content": "hi"}],
            "max_tokens": 5
        }).to_string()
    };

    let mut cmd = Command::new("curl");
    cmd.arg("-s").arg("-X").arg("POST").arg(&target_url)
       .arg("-H").arg("Content-Type: application/json");

    if is_anthropic {
        cmd.arg("-H").arg(format!("x-api-key: {}", api_key))
           .arg("-H").arg("anthropic-version: 2023-06-01");
    } else {
        cmd.arg("-H").arg(format!("Authorization: Bearer {}", api_key));
    }

    cmd.arg("--data").arg(&body)
       .arg("--max-time").arg("10")
       .arg("--output").arg("-")
       .arg("-w").arg("%{http_code}")
       .stderr(Stdio::null());

    match cmd.output() {
        Ok(output) => {
            let text = String::from_utf8_lossy(&output.stdout);
            // curl -w "%{http_code}" appends status code
            let text_str: &str = &text;
            let (body_part, status) = if text_str.len() >= 3 {
                let (b, s) = text_str.split_at(text_str.len() - 3);
                (b, s.parse::<u32>().unwrap_or(0))
            } else {
                (text_str, 0)
            };
            if status == 200 && (body_part.contains("id") || body_part.contains("choices") || body_part.contains("content")) {
                Ok(true)
            } else {
                Ok(false)
            }
        }
        Err(e) => {
            error!("Model test failed: {}", e);
            Err(e.to_string())
        }
    }
}

#[tauri::command]
fn toggle_qc_window(app: AppHandle<Wry>, enabled: bool) -> bool {
    if enabled {
        let mut guard = get_qc_window().lock().unwrap();
        if guard.is_none() {
            let _disp = tauri::PhysicalPosition { x: 100, y: 100 }; // placeholder, will center
            match WebviewWindowBuilder::new(&app, "qc", WebviewUrl::App("/qc".into()))
                .title("QuickCapture")
                .inner_size(420.0, 540.0)
                .decorations(false)
                .always_on_top(true)
                .skip_taskbar(true)
                .resizable(false)
                .center()
                .build()
            {
                Ok(w) => { *guard = Some(w); }
                Err(e) => { error!("QC window create failed: {}", e); }
            }
        }
    } else {
        let mut guard = get_qc_window().lock().unwrap();
        if let Some(w) = guard.take() {
            let _ = w.close();
        }
    }
    enabled
}

#[tauri::command]
fn open_qc_form(_app: AppHandle<Wry>) -> bool {
    let guard = get_qc_window().lock().unwrap();
    if let Some(w) = guard.as_ref() {
        let _ = w.set_size(tauri::Size::Physical(tauri::PhysicalSize { width: 420, height: 540 }));
        let _ = w.center();
        let _ = w.show();
        true
    } else {
        false
    }
}

#[tauri::command]
fn close_qc_form(_app: AppHandle<Wry>) -> bool {
    let guard = get_qc_window().lock().unwrap();
    if let Some(w) = guard.as_ref() {
        let _ = w.set_size(tauri::Size::Physical(tauri::PhysicalSize { width: 56, height: 56 }));
        true
    } else {
        false
    }
}

// Auto-update stubs (using Tauri built-in updater plugin in production)
#[tauri::command]
fn check_for_update(_app: AppHandle<Wry>) -> serde_json::Value {
    serde_json::json!({
        "available": false,
        "current": env!("CARGO_PKG_VERSION"),
        "error": "Auto-update not configured in Tauri build"
    })
}

#[tauri::command]
fn download_update() -> serde_json::Value {
    serde_json::json!({ "ok": false, "error": "Auto-update not implemented" })
}

#[tauri::command]
fn install_update(_app: AppHandle<Wry>) -> bool {
    // Would use app.restart() in real auto-update flow
    error!("install_update called but not implemented");
    false
}

fn setup_tray(app: &AppHandle<Wry>) -> Result<(), Box<dyn std::error::Error>> {
    let show = MenuItemBuilder::with_id("show", "显示窗口").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "退出").build(app)?;
    let menu = MenuBuilder::new(app)
        .items(&[&show, &quit])
        .build()?;

    let _tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("Workit")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            match event.id().as_ref() {
                "show" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "quit" => {
                    app.exit(0);
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                if let Some(window) = tray.app_handle().get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;
    Ok(())
}

// JavaScript bridge injected into all webview windows before any page scripts.
// Sets up window.electronAPI using Tauri's __TAURI_INTERNALS__.
const BRIDGE_JS: &str = r#"
(function() {
  try {
    const { invoke } = window.__TAURI_INTERNALS__.core;
    const { listen } = window.__TAURI_INTERNALS__.event;
    const platform = navigator.platform;

    window.electronAPI = {
      __isQCPopup: false,
      platform,
      versions: { node: '24', chrome: '120', electron: '32' },

      getVersion: () => invoke("get_version"),

      minimize: () => invoke("window_minimize"),
      maximize: () => invoke("window_maximize"),
      close: () => invoke("window_close"),
      isMaximized: () => invoke("window_is_maximized"),

      onMaximizeChange: (cb) => {
        const unlisten = listen("window-maximized-change", (e) => cb(e.payload));
        window.__unlistenMaximize = unlisten;
        return () => unlisten();
      },

      dbQuery: (method, table, args) => invoke("db_query", { method, table, args }),
      dbUpload: (table, fileData) => invoke("db_upload", { table, fileData }),

      checkForUpdate: () => invoke("check_for_update"),
      downloadUpdate: () => invoke("download_update"),
      installUpdate: () => invoke("install_update"),

      onUpdateAvailable: (cb) => {
        const unlisten = listen("update-available", (e) => cb(e.payload));
        window.__unlistenUpdateAvailable = unlisten;
        return () => unlisten();
      },
      onUpdateProgress: (cb) => {
        const unlisten = listen("update-download-progress", (e) => cb(e.payload));
        window.__unlistenUpdateProgress = unlisten;
        return () => unlisten();
      },
      onUpdateDownloaded: (cb) => {
        const unlisten = listen("update-downloaded", () => cb());
        window.__unlistenUpdateDownloaded = unlisten;
        return () => unlisten();
      },

      getSettings: () => invoke("get_settings"),
      setMinimizeToTray: (enabled) => invoke("set_minimize_to_tray", { enabled }),
      setOpenAtLogin: (enabled) => invoke("set_open_at_login", { enabled }),
      toggleQCWindow: (enabled) => invoke("toggle_qc_window", { enabled }),
      openQCForm: () => invoke("open_qc_form"),
      closeQCForm: () => invoke("close_qc_form"),
      notifyRequirementsChanged: () => invoke("notify_requirements_changed"),
      testModelConnection: (baseUrl, apiKey, modelId) =>
        invoke("test_model_connection", { baseUrl, apiKey, modelId }),

      readClipboardImages: () => invoke("read_clipboard_images"),
      readClipboardText: () => invoke("read_clipboard_text"),
      readClipboardHTML: () => invoke("read_clipboard_html"),
      readClipboardFiles: () => invoke("read_clipboard_files"),
      readLocalFile: (filePath) => invoke("read_local_file", { filePath }),

      onRequirementsChanged: (cb) => {
        const unlisten = listen("requirements-changed", () => cb());
        window.__unlistenReqChanged = unlisten;
        return () => unlisten();
      },
    };
    console.log("[tauri-bridge] electronAPI initialized");
  } catch(e) {
    console.error("[tauri-bridge] Failed to initialize:", e);
  }
})();

"#;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .manage(AppState {
            db: Mutex::new(DbState::new()),
            minimize_to_tray: Mutex::new(false),
        })
        .append_invoke_initialization_script(BRIDGE_JS)
        .invoke_handler(tauri::generate_handler![
            get_version,
            window_minimize,
            window_maximize,
            window_close,
            window_is_maximized,
            db_query,
            db_upload,
            cmd_read_clipboard_images,
            cmd_read_clipboard_text,
            cmd_read_clipboard_html,
            cmd_read_clipboard_files,
            cmd_read_local_file,
            get_settings,
            set_minimize_to_tray,
            set_open_at_login,
            notify_requirements_changed,
            test_model_connection,
            toggle_qc_window,
            open_qc_form,
            close_qc_form,
            check_for_update,
            download_update,
            install_update,
        ])
        .setup(|app| {
            info!("Workit starting up...");

            {
                let state = app.state::<AppState>();
                let mut db = state.db.lock().unwrap_or_else(|e| e.into_inner());
                if let Err(e) = db.init() {
                    error!("Database init failed: {}", e);
                } else {
                    info!("Database initialized");
                }
            }

            if let Some(window) = app.get_webview_window("main") {
                let w = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        if let Some(state) = w.try_state::<AppState>() {
                            if *state.minimize_to_tray.lock().unwrap_or_else(|e| e.into_inner()) {
                                api.prevent_close();
                                let _ = w.hide();
                            }
                        }
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}