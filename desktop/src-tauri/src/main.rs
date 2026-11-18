// Crate Works Live desktop app, step 1: the dashboard page in a Tauri window.
// server.js runs as a sidecar (compiled to one executable by scripts/build-sidecar.mjs) on 127.0.0.1:4545,
// the same port the global permission hook in ~/.claude/settings.json points at.
// If something already listens on 4545 (a `node server.js` you started yourself), the app opens that
// server instead of starting a second one. The window first shows the local loading page, then
// navigates to the server once its port answers. While the app runs, a watchdog checks the port: when it stays
// quiet (that server was stopped, or our sidecar crashed), the app starts its own sidecar and reloads the page.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::net::{SocketAddr, TcpStream};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager, RunEvent, Url};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

const DEFAULT_PORT: u16 = 4545;
const START_TIMEOUT: Duration = Duration::from_secs(60);
/// How often the watchdog checks the port, and how long it must stay quiet before the app starts its own server
/// (long enough that restarting a `node server.js` by hand does not race the sidecar for the port).
const WATCH_EVERY: Duration = Duration::from_secs(2);
const QUIET_FOR: Duration = Duration::from_secs(10);

/// Port for this run: CRATE_WORKS_PORT if it is a valid port, else 4545.
/// Only 4545 is reached by the global permission hook; another port is for testing next to a running server.
fn port() -> u16 {
    std::env::var("CRATE_WORKS_PORT")
        .ok()
        .and_then(|v| v.parse().ok())
        .filter(|p| *p > 0)
        .unwrap_or(DEFAULT_PORT)
}

/// The sidecar we started, if any; killed when the app exits.
struct Sidecar(Mutex<Option<CommandChild>>);

fn port_open() -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], port()));
    TcpStream::connect_timeout(&addr, Duration::from_millis(300)).is_ok()
}

/// Windows resource paths can carry the `\\?\` verbatim prefix; give Node a plain path.
fn plain(p: PathBuf) -> String {
    let s = p.to_string_lossy().into_owned();
    s.strip_prefix(r"\\?\").map(str::to_owned).unwrap_or(s)
}

/// Show a message on the local loading page (only works while that page is shown).
fn show_error(app: &AppHandle, text: &str) {
    if let Some(w) = app.get_webview_window("main") {
        let js = format!(
            "(() => {{ const m = document.getElementById('msg'); if (m) {{ m.textContent = {}; m.className = 'error'; }} }})()",
            serde_json_string(text)
        );
        let _ = w.eval(&js);
    }
}

/// Minimal JSON string literal (quotes, backslashes, control characters), so no extra crate is needed.
fn serde_json_string(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            c if (c as u32) < 0x20 || c == '\u{2028}' || c == '\u{2029}' => {
                out.push_str(&format!("\\u{:04x}", c as u32))
            }
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

fn start_sidecar(app: &AppHandle, exited: Arc<AtomicBool>) -> Result<(), String> {
    let web = app
        .path()
        .resource_dir()
        .map_err(|e| format!("cannot find the resource folder: {e}"))?
        .join("web");
    let (mut rx, child) = app
        .shell()
        .sidecar("server")
        .map_err(|e| format!("cannot find the server sidecar: {e}"))?
        .args(["--port", &port().to_string(), "--static", &plain(web)])
        .spawn()
        .map_err(|e| format!("cannot start the server sidecar: {e}"))?;
    *app.state::<Sidecar>().0.lock().unwrap() = Some(child);

    tauri::async_runtime::spawn(async move {
        while let Some(ev) = rx.recv().await {
            match ev {
                CommandEvent::Stdout(line) => print!("[server] {}", String::from_utf8_lossy(&line)),
                CommandEvent::Stderr(line) => eprint!("[server] {}", String::from_utf8_lossy(&line)),
                CommandEvent::Terminated(p) => {
                    eprintln!("[server] exited (code {:?})", p.code);
                    exited.store(true, Ordering::SeqCst);
                }
                _ => {}
            }
        }
    });
    Ok(())
}

/// Wait until the port answers; false when the sidecar exited first or START_TIMEOUT passed.
fn wait_ready(exited: &AtomicBool) -> bool {
    let t0 = Instant::now();
    while !port_open() {
        if exited.load(Ordering::SeqCst) || t0.elapsed() > START_TIMEOUT {
            return false;
        }
        thread::sleep(Duration::from_millis(200));
    }
    true
}

fn open_page(app: &AppHandle) {
    let url = Url::parse(&format!("http://127.0.0.1:{}/", port())).expect("valid url");
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.navigate(url);
    }
}

/// Runs for the life of the app. When the port stays quiet for QUIET_FOR (the server we opened was stopped, or our
/// sidecar crashed), start our own sidecar and reload the page once it answers. When another server comes back on
/// the port first, reload too: a new server start means a new page token.
fn watchdog(app: &AppHandle) {
    let mut quiet: Option<Instant> = None;
    loop {
        thread::sleep(WATCH_EVERY);
        if port_open() {
            if quiet.take().is_some() {
                println!("port {} answers again: reloading the page", port());
                open_page(app);
            }
            continue;
        }
        let since = *quiet.get_or_insert_with(Instant::now);
        if since.elapsed() < QUIET_FOR {
            continue;
        }
        eprintln!("port {} quiet for {}s: starting the server sidecar", port(), QUIET_FOR.as_secs());
        if let Some(old) = app.state::<Sidecar>().0.lock().unwrap().take() {
            let _ = old.kill();
        }
        let exited = Arc::new(AtomicBool::new(false));
        match start_sidecar(app, exited.clone()) {
            Ok(()) if wait_ready(&exited) => {
                println!("server sidecar started: reloading the page");
                quiet = None;
                open_page(app);
            }
            Ok(()) => {
                eprintln!("the server sidecar did not come up; trying again");
                quiet = Some(Instant::now());
            }
            Err(e) => {
                eprintln!("{e}; trying again");
                quiet = Some(Instant::now());
            }
        }
    }
}

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(Sidecar(Mutex::new(None)))
        .setup(|app| {
            let handle = app.handle().clone();
            let exited = Arc::new(AtomicBool::new(false));
            let reuse = port_open();
            if !reuse {
                if let Err(e) = start_sidecar(&handle, exited.clone()) {
                    eprintln!("{e}");
                    let h = handle.clone();
                    // give the loading page a moment to load before writing into it
                    thread::spawn(move || {
                        thread::sleep(Duration::from_millis(500));
                        show_error(&h, &e);
                    });
                    return Ok(());
                }
            }

            thread::spawn(move || {
                let p = port();
                if !wait_ready(&exited) {
                    let msg = if exited.load(Ordering::SeqCst) {
                        format!("The factory server stopped before it was ready.\nIs port {p} free?")
                    } else {
                        format!("The factory server did not answer on port {p} within {}s.", START_TIMEOUT.as_secs())
                    };
                    show_error(&handle, &msg);
                    return;
                }
                if reuse {
                    println!("port {p} already in use: opening the server that is running there");
                }
                open_page(&handle);
                watchdog(&handle);
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building the Tauri app");

    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            // Hard stop of the server process. Sessions it started see their stdin close and exit on their own.
            if let Some(child) = handle.state::<Sidecar>().0.lock().unwrap().take() {
                let _ = child.kill();
            }
        }
    });
}
