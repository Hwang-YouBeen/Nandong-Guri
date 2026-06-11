use serde::{Deserialize, Serialize};
use std::{
    sync::Mutex,
    thread,
    time::{Duration, Instant},
};
#[cfg(target_os = "macos")]
use std::process::Command;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_notification::NotificationExt;
use tiny_http::{Header, Method, Response, Server, StatusCode};

const BRIDGE_ADDRESS: &str = "127.0.0.1:43119";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CompletionEvent {
    service: String,
    url: String,
    title: Option<String>,
    already_viewing: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppSettings {
    sound_enabled: bool,
    system_notifications: bool,
    raccoon_scale: f64,
    launch_at_login: bool,
    emergency_shortcut: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            sound_enabled: true,
            system_notifications: true,
            raccoon_scale: 1.0,
            launch_at_login: false,
            emergency_shortcut: "CommandOrControl+Shift+G".into(),
        }
    }
}

#[derive(Default)]
struct RuntimeState {
    active_url: Mutex<Option<String>>,
    settings: Mutex<AppSettings>,
    monitor_index: Mutex<usize>,
    extension_last_seen: Mutex<Option<Instant>>,
    overlay_hitbox: Mutex<Option<OverlayHitbox>>,
    focus_request: Mutex<Option<FocusRequest>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FocusRequest {
    request_id: u128,
    url: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FocusAck {
    request_id: u128,
    browser: Option<String>,
}

#[derive(Debug, Clone, Copy)]
struct OverlayHitbox {
    left: f64,
    top: f64,
    right: f64,
    bottom: f64,
}

#[tauri::command]
fn get_settings(state: State<RuntimeState>) -> AppSettings {
    state.settings.lock().expect("settings lock").clone()
}

#[tauri::command]
fn save_settings(
    app: AppHandle,
    state: State<RuntimeState>,
    settings: AppSettings,
) -> Result<(), String> {
    *state.settings.lock().map_err(|error| error.to_string())? = settings.clone();
    app.emit("settings-updated", settings)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn hide_settings_window(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "settings window not found".to_string())?;
    window.hide().map_err(|error| error.to_string())
}

fn hide_overlays(app: &AppHandle) {
    for (_, window) in app.webview_windows() {
        if window.label().starts_with("overlay") {
            let _ = window.hide();
        }
    }
}

#[tauri::command]
fn dismiss_raccoon(app: AppHandle) -> Result<(), String> {
    *app.state::<RuntimeState>()
        .overlay_hitbox
        .lock()
        .map_err(|error| error.to_string())? = None;
    app.emit("raccoon-dismiss", ())
        .map_err(|error| error.to_string())?;
    hide_overlays(&app);
    Ok(())
}

#[tauri::command]
fn update_overlay_hitbox(
    app: AppHandle,
    state: State<RuntimeState>,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let window = app
        .get_webview_window("overlay")
        .ok_or_else(|| "overlay window not found".to_string())?;
    let position = window.inner_position().map_err(|error| error.to_string())?;
    let scale = window.scale_factor().map_err(|error| error.to_string())?;
    *state
        .overlay_hitbox
        .lock()
        .map_err(|error| error.to_string())? = Some(OverlayHitbox {
        left: position.x as f64 + x * scale,
        top: position.y as f64 + y * scale,
        right: position.x as f64 + (x + width) * scale,
        bottom: position.y as f64 + (y + height) * scale,
    });
    Ok(())
}

#[tauri::command]
fn open_active_answer(app: AppHandle, state: State<RuntimeState>) -> Result<(), String> {
    if let Some(url) = state
        .active_url
        .lock()
        .map_err(|error| error.to_string())?
        .clone()
    {
        let request_id = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|error| error.to_string())?
            .as_millis();
        *state
            .focus_request
            .lock()
            .map_err(|error| error.to_string())? = Some(FocusRequest { request_id, url });
    }
    dismiss_raccoon(app)
}

#[cfg(target_os = "macos")]
fn activate_browser(browser: Option<&str>) {
    let application = match browser {
        Some("edge") => "Microsoft Edge",
        Some("opera") => "Opera",
        _ => "Google Chrome",
    };
    let _ = Command::new("open").args(["-a", application]).status();
}

#[cfg(not(target_os = "macos"))]
fn activate_browser(_browser: Option<&str>) {}

#[tauri::command]
fn move_to_next_monitor(app: AppHandle, state: State<RuntimeState>) -> Result<(), String> {
    let monitors = app
        .available_monitors()
        .map_err(|error| error.to_string())?;
    if monitors.len() < 2 {
        return Ok(());
    }
    let mut index = state
        .monitor_index
        .lock()
        .map_err(|error| error.to_string())?;
    *index = (*index + 1) % monitors.len();
    position_overlay(&app, &monitors[*index])
}

fn ensure_overlay(app: &AppHandle) -> tauri::Result<tauri::WebviewWindow> {
    if let Some(window) = app.get_webview_window("overlay") {
        return Ok(window);
    }
    let window = WebviewWindowBuilder::new(
        app,
        "overlay",
        WebviewUrl::App("index.html?view=overlay".into()),
    )
    .title("난동구리")
    .transparent(true)
    .decorations(false)
    .shadow(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .visible(false)
    .resizable(false)
    .build()?;
    window.set_ignore_cursor_events(true)?;
    Ok(window)
}

fn start_overlay_hit_testing(app: AppHandle) {
    thread::spawn(move || {
        let mut accepting_clicks = false;
        loop {
            thread::sleep(Duration::from_millis(24));
            let Some(window) = app.get_webview_window("overlay") else {
                continue;
            };
            let hitbox = app
                .state::<RuntimeState>()
                .overlay_hitbox
                .lock()
                .ok()
                .and_then(|value| *value);
            let should_accept = match (hitbox, app.cursor_position().ok()) {
                (Some(rect), Some(cursor)) => {
                    cursor.x >= rect.left
                        && cursor.x <= rect.right
                        && cursor.y >= rect.top
                        && cursor.y <= rect.bottom
                }
                _ => false,
            };
            if should_accept != accepting_clicks {
                let _ = window.set_ignore_cursor_events(!should_accept);
                accepting_clicks = should_accept;
            }
        }
    });
}

fn position_overlay(app: &AppHandle, monitor: &tauri::Monitor) -> Result<(), String> {
    let window = ensure_overlay(app).map_err(|error| error.to_string())?;
    window
        .set_position(*monitor.position())
        .map_err(|error| error.to_string())?;
    window
        .set_size(*monitor.size())
        .map_err(|error| error.to_string())?;
    window.show().map_err(|error| error.to_string())
}

fn show_raccoon(app: &AppHandle, event: CompletionEvent) -> Result<(), String> {
    let state = app.state::<RuntimeState>();
    *state.active_url.lock().map_err(|error| error.to_string())? = Some(event.url.clone());
    *state
        .monitor_index
        .lock()
        .map_err(|error| error.to_string())? = 0;

    let monitor = app
        .primary_monitor()
        .map_err(|error| error.to_string())?
        .or_else(|| app.available_monitors().ok()?.into_iter().next())
        .ok_or_else(|| "사용 가능한 모니터가 없습니다.".to_string())?;
    position_overlay(app, &monitor)?;
    app.emit("ai-answer-complete", event.clone())
        .map_err(|error| error.to_string())?;

    let settings = state.settings.lock().expect("settings lock").clone();
    if settings.system_notifications {
        let _ = app
            .notification()
            .builder()
            .title("난동구리 출동!")
            .body(format!(
                "{} 답변 완료. 클릭하기 전까지 5초마다 더 난동을 부립니다.",
                event.service
            ))
            .show();
    }
    Ok(())
}

fn bridge_response(body: &str, status: StatusCode) -> Response<std::io::Cursor<Vec<u8>>> {
    let mut response = Response::from_string(body).with_status_code(status);
    response
        .add_header(Header::from_bytes("Access-Control-Allow-Origin", "*").expect("CORS header"));
    response.add_header(
        Header::from_bytes("Access-Control-Allow-Headers", "Content-Type").expect("CORS header"),
    );
    response
}

fn start_bridge(app: AppHandle) {
    thread::spawn(move || {
        let Ok(server) = Server::http(BRIDGE_ADDRESS) else {
            eprintln!("Nandong Guri bridge already running at {BRIDGE_ADDRESS}");
            return;
        };

        for mut request in server.incoming_requests() {
            if request.method() == &Method::Options {
                let _ = request.respond(bridge_response("", StatusCode(204)));
                continue;
            }

            match (request.method(), request.url()) {
                (&Method::Get, "/health") => {
                    let _ = request.respond(bridge_response(
                        r#"{"ok":true,"app":"Nandong Guri"}"#,
                        StatusCode(200),
                    ));
                }
                (&Method::Get, "/extension-status") => {
                    let connected = app
                        .state::<RuntimeState>()
                        .extension_last_seen
                        .lock()
                        .ok()
                        .and_then(|last_seen| *last_seen)
                        .is_some_and(|last_seen| last_seen.elapsed() < Duration::from_secs(15));
                    let body = format!(r#"{{"connected":{connected}}}"#);
                    let _ = request.respond(bridge_response(&body, StatusCode(200)));
                }
                (&Method::Get, "/focus-request") => {
                    let focus_request = app
                        .state::<RuntimeState>()
                        .focus_request
                        .lock()
                        .ok()
                        .and_then(|request| request.clone());
                    let body = match focus_request {
                        Some(request) => serde_json::json!({
                            "requested": true,
                            "requestId": request.request_id,
                            "url": request.url,
                        })
                        .to_string(),
                        None => r#"{"requested":false}"#.to_string(),
                    };
                    let _ = request.respond(bridge_response(&body, StatusCode(200)));
                }
                (&Method::Post, "/extension-ping") => {
                    if let Ok(mut last_seen) =
                        app.state::<RuntimeState>().extension_last_seen.lock()
                    {
                        *last_seen = Some(Instant::now());
                    }
                    let _ = request.respond(bridge_response(r#"{"ok":true}"#, StatusCode(200)));
                }
                (&Method::Post, "/complete") => {
                    let mut body = String::new();
                    let event = request
                        .as_reader()
                        .read_to_string(&mut body)
                        .ok()
                        .and_then(|_| serde_json::from_str::<CompletionEvent>(&body).ok());
                    if let Some(event) = event {
                        let ok = show_raccoon(&app, event).is_ok();
                        let _ = request.respond(bridge_response(
                            if ok {
                                r#"{"ok":true}"#
                            } else {
                                r#"{"ok":false}"#
                            },
                            if ok { StatusCode(200) } else { StatusCode(500) },
                        ));
                    } else {
                        let _ = request.respond(bridge_response(
                            r#"{"ok":false,"error":"invalid payload"}"#,
                            StatusCode(400),
                        ));
                    }
                }
                (&Method::Post, "/viewed") => {
                    let _ = dismiss_raccoon(app.clone());
                    let _ = request.respond(bridge_response(r#"{"ok":true}"#, StatusCode(200)));
                }
                (&Method::Post, "/focus-ack") => {
                    let mut body = String::new();
                    let ack = request
                        .as_reader()
                        .read_to_string(&mut body)
                        .ok()
                        .and_then(|_| serde_json::from_str::<FocusAck>(&body).ok());
                    if let Some(ack) = ack {
                        let mut matched = false;
                        if let Ok(mut focus_request) =
                            app.state::<RuntimeState>().focus_request.lock()
                        {
                            matched = focus_request
                                .as_ref()
                                .is_some_and(|pending| pending.request_id == ack.request_id);
                            if matched {
                                *focus_request = None;
                            }
                        }
                        if matched {
                            activate_browser(ack.browser.as_deref());
                        }
                    }
                    let _ = request.respond(bridge_response(r#"{"ok":true}"#, StatusCode(200)));
                }
                _ => {
                    let _ = request.respond(bridge_response(
                        r#"{"ok":false,"error":"not found"}"#,
                        StatusCode(404),
                    ));
                }
            }
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(RuntimeState::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        let _ = dismiss_raccoon(app.clone());
                    }
                })
                .build(),
        )
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let show = MenuItem::with_id(app, "show", "설정 열기", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "난동구리 종료", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            let tray_icon = tauri::image::Image::from_bytes(include_bytes!(
                "../icons/tray-template.png"
            ))?;
            TrayIconBuilder::new()
                .icon(tray_icon)
                .icon_as_template(true)
                .tooltip("난동구리")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        if let Some(window) = tray.app_handle().get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.center();
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.center();
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            if let Some(window) = app.get_webview_window("main") {
                let settings_window = window.clone();
                window.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = settings_window.hide();
                    }
                });
            }

            app.global_shortcut().register("CommandOrControl+Shift+G")?;
            start_bridge(app.handle().clone());
            start_overlay_hit_testing(app.handle().clone());

            let handle = app.handle().clone();
            thread::spawn(move || {
                thread::sleep(Duration::from_millis(500));
                let _ = ensure_overlay(&handle);
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_settings,
            save_settings,
            hide_settings_window,
            dismiss_raccoon,
            open_active_answer,
            move_to_next_monitor,
            update_overlay_hitbox
        ])
        .run(tauri::generate_context!())
        .expect("error while running Nandong Guri");
}
