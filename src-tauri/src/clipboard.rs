use std::path::PathBuf;

pub fn tauri_read_clipboard_text() -> String {
    match clipboard_win::get_clipboard_string() {
        Ok(s) => s,
        Err(_) => String::new(),
    }
}

pub fn tauri_read_clipboard_html() -> String {
    tauri_read_clipboard_text()
}

pub fn tauri_read_clipboard_images() -> Vec<String> {
    vec![]
}

pub fn tauri_read_clipboard_files() -> Vec<String> {
    let text = tauri_read_clipboard_text();
    text.lines()
        .filter(|l| l.starts_with("file://") || (l.len() > 2 && l.chars().nth(1) == Some(':') && l.contains("\\")))
        .map(|l| l.trim().to_string())
        .collect()
}

pub fn tauri_read_local_file(file_path: &str) -> Option<String> {
    let path = PathBuf::from(file_path);
    if !path.exists() {
        log::warn!("readLocalFile: not found: {}", file_path);
        return None;
    }

    let data = std::fs::read(&path).ok()?;
    let ext = path.extension()?.to_str()?.to_lowercase();

    let mime_map = std::collections::HashMap::from([
        ("png", "image/png"), ("jpg", "image/jpeg"), ("jpeg", "image/jpeg"),
        ("gif", "image/gif"), ("webp", "image/webp"), ("bmp", "image/bmp"),
        ("svg", "image/svg+xml"), ("ico", "image/x-icon"), ("tiff", "image/tiff"),
        ("mp4", "video/mp4"), ("mov", "video/quicktime"), ("avi", "video/x-msvideo"),
        ("webm", "video/webm"), ("mkv", "video/x-matroska"),
        ("doc", "application/msword"), ("docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
        ("pdf", "application/pdf"),
        ("xls", "application/vnd.ms-excel"), ("xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
        ("ppt", "application/vnd.ms-powerpoint"), ("pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"),
        ("csv", "text/csv"), ("rtf", "application/rtf"),
        ("html", "text/html"), ("htm", "text/html"), ("md", "text/markdown"),
        ("json", "application/json"), ("xml", "application/xml"),
        ("yaml", "text/yaml"), ("yml", "text/yaml"),
        ("txt", "text/plain"), ("log", "text/plain"),
        ("py", "text/x-python"), ("js", "text/javascript"), ("ts", "text/typescript"),
        ("css", "text/css"), ("sh", "application/x-sh"), ("bat", "application/x-bat"),
        ("ps1", "text/plain"), ("sql", "application/sql"),
    ]);

    let mime = mime_map.get(ext.as_str()).copied().unwrap_or("application/octet-stream");
    use base64::Engine as _;
    let base64_str = base64::engine::general_purpose::STANDARD.encode(&data);
    Some(format!("data:{};base64,{}", mime, base64_str))
}