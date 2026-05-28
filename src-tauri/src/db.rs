use rusqlite::{Connection, Result as SqlResult, params};
use serde_json::Value as JsonValue;
use std::path::PathBuf;
use log::{info, error};
use crate::crypto::{encrypt_api_key, decrypt_api_key};

pub struct DbState {
    pub conn: Connection,
    pub db_path: PathBuf,
}

impl DbState {
    pub fn new() -> Self {
        let db_path = dirs::data_local_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("workit")
            .join("workit-data.db");

        if let Some(parent) = db_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }

        let conn = Connection::open(&db_path).expect("Failed to open database");
        DbState { conn, db_path }
    }

    pub fn init(&mut self) -> SqlResult<()> {
        let conn = &self.conn;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS requirements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT DEFAULT '',
                category TEXT DEFAULT '产品',
                module TEXT DEFAULT '用户端',
                priority TEXT DEFAULT '中',
                status TEXT DEFAULT '待评估',
                assignee TEXT DEFAULT '',
                creator TEXT DEFAULT '',
                due_date TEXT DEFAULT '',
                tags TEXT DEFAULT '[]',
                images TEXT DEFAULT '[]',
                ai_summary TEXT DEFAULT '',
                ai_tags TEXT DEFAULT '[]',
                image_descriptions TEXT DEFAULT '[]',
                workflow_handler TEXT DEFAULT '',
                workflow_history TEXT DEFAULT '[]',
                created_at TEXT DEFAULT (datetime('now','localtime')),
                updated_at TEXT DEFAULT (datetime('now','localtime')),
                content_blocks TEXT DEFAULT '[]'
            )", []).ok();

        conn.execute(
            "CREATE TABLE IF NOT EXISTS documents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                category TEXT DEFAULT 'guide',
                type TEXT DEFAULT 'MD',
                size TEXT DEFAULT '',
                views INTEGER DEFAULT 0,
                stars INTEGER DEFAULT 0,
                date TEXT DEFAULT '',
                tags TEXT DEFAULT '[]',
                featured INTEGER DEFAULT 0,
                file_path TEXT DEFAULT '',
                content TEXT DEFAULT '',
                image_descriptions TEXT DEFAULT '[]',
                created_at TEXT DEFAULT (datetime('now','localtime')),
                updated_at TEXT DEFAULT (datetime('now','localtime'))
            )", []).ok();

        conn.execute(
            "CREATE TABLE IF NOT EXISTS mcp_servers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                type TEXT NOT NULL,
                command TEXT NOT NULL,
                args TEXT DEFAULT '[]',
                env TEXT DEFAULT '{}',
                enabled INTEGER DEFAULT 0,
                config TEXT DEFAULT '{}',
                created_at TEXT DEFAULT (datetime('now','localtime'))
            )", []).ok();

        conn.execute(
            "CREATE TABLE IF NOT EXISTS models (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                provider TEXT NOT NULL,
                base_url TEXT DEFAULT '',
                api_key TEXT DEFAULT '',
                model_id TEXT NOT NULL,
                enabled INTEGER DEFAULT 0,
                is_default INTEGER DEFAULT 0,
                config TEXT DEFAULT '{}',
                created_at TEXT DEFAULT (datetime('now','localtime'))
            )", []).ok();

        conn.execute("UPDATE requirements SET status = '待评估' WHERE status = '待评审'", []).ok();

        info!("Database tables initialized at {:?}", self.db_path);
        Ok(())
    }

    pub fn run(&self, sql: &str) {
        if let Err(e) = self.conn.execute(sql, []) {
            error!("Run error: {} sql={}", e, sql);
        }
    }

    pub fn last_insert_rowid(&self) -> i64 {
        self.conn.last_insert_rowid()
    }
}

pub fn handle_db_query(
    db: &DbState,
    method: &str,
    table: &str,
    args: Option<JsonValue>,
) -> JsonValue {
    let data = args.as_ref().and_then(|v| v.get("data"));
    let id = args.as_ref().and_then(|v| v.get("id")).and_then(|v| v.as_i64());

    match table {
        "requirements" => handle_requirements(db, method, data, id),
        "documents" => handle_documents(db, method, data, id),
        "mcp" => handle_mcp(db, method, data, id),
        "models" => handle_models(db, method, data, id),
        "dashboard/stats" if method == "GET" => dashboard_stats(db),
        "dashboard/charts" if method == "GET" => dashboard_charts(db),
        "dashboard/activities" if method == "GET" => dashboard_activities(db),
        "insights/kpis" if method == "GET" => insights_kpis(db),
        "insights/charts" if method == "GET" => insights_charts(db),
        "insights/ai-insights" => handle_ai_insights(db, method),
        "storage/stats" if method == "GET" => storage_stats(db),
        _ => {
            let parts: Vec<&str> = table.split('/').collect();
            if parts.len() == 3 {
                let res_type = parts[0];
                let res_id: i64 = parts[1].parse().unwrap_or(0);
                let action = parts[2];
                if res_type == "requirements" || res_type == "documents" {
                    return handle_resource_action(db, res_type, res_id, action);
                }
            }
            serde_json::json!({ "error": "Unknown table" })
        }
    }
}

fn handle_requirements(db: &DbState, method: &str, data: Option<&JsonValue>, id: Option<i64>) -> JsonValue {
    match method {
        "GET" => {
            if let Some(id) = id {
                let mut stmt = match db.conn.prepare("SELECT id, title, description, category, module, priority, status, assignee, creator, due_date, tags, images, ai_summary, ai_tags, image_descriptions, workflow_handler, workflow_history, created_at, updated_at, content_blocks FROM requirements WHERE id = ?") {
                    Ok(s) => s,
                    Err(_) => return serde_json::json!({ "error": "Query failed" }),
                };
                let mut rows = match stmt.query(params![id]) {
                    Ok(r) => r,
                    Err(_) => return serde_json::json!({ "error": "Query failed" }),
                };
                if let Ok(Some(row)) = rows.next() {
                    return format_req_row(row);
                }
                serde_json::json!({ "error": "Not found" })
            } else {
                let mut stmt = match db.conn.prepare("SELECT id, title, description, category, module, priority, status, assignee, creator, due_date, tags, images, ai_summary, ai_tags, image_descriptions, workflow_handler, workflow_history, created_at, updated_at, content_blocks FROM requirements ORDER BY created_at DESC") {
                    Ok(s) => s,
                    Err(_) => return serde_json::json!([]),
                };
                let mut rows = match stmt.query([]) {
                    Ok(r) => r,
                    Err(_) => return serde_json::json!([]),
                };
                let mut result = vec![];
                while let Ok(Some(row)) = rows.next() {
                    result.push(format_req_row(row));
                }
                serde_json::json!(result)
            }
        }
        "POST" => {
            let d = data.unwrap_or(&serde_json::Value::Null);
            let tags = serde_json::to_string(&d.get("tags").and_then(|v| v.as_array()).cloned().unwrap_or_default()).unwrap_or_else(|_| "[]".to_string());
            let images = serde_json::to_string(&d.get("images").and_then(|v| v.as_array()).cloned().unwrap_or_default()).unwrap_or_else(|_| "[]".to_string());
            let content_blocks = serde_json::to_string(&d.get("content_blocks").and_then(|v| v.as_array()).cloned().unwrap_or_default()).unwrap_or_else(|_| "[]".to_string());
            let _ = db.conn.execute(
                "INSERT INTO requirements (title, description, category, module, priority, assignee, creator, due_date, tags, images, content_blocks) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                params![
                    d.get("title").and_then(|v| v.as_str()).unwrap_or(""),
                    d.get("description").and_then(|v| v.as_str()).unwrap_or(""),
                    d.get("category").and_then(|v| v.as_str()).unwrap_or(""),
                    d.get("module").and_then(|v| v.as_str()).unwrap_or("用户端"),
                    d.get("priority").and_then(|v| v.as_str()).unwrap_or(""),
                    d.get("assignee").and_then(|v| v.as_str()).unwrap_or(""),
                    d.get("creator").and_then(|v| v.as_str()).unwrap_or(""),
                    d.get("dueDate").and_then(|v| v.as_str()).unwrap_or(""),
                    tags,
                    images,
                    content_blocks,
                ],
            );
            serde_json::json!({ "success": true, "id": db.last_insert_rowid() })
        }
        "PUT" => {
            let Some(id) = id else { return serde_json::json!({ "error": "No id" }); };
            let d = data.unwrap_or(&serde_json::Value::Null);
            let tags = serde_json::to_string(&d.get("tags").and_then(|v| v.as_array()).cloned().unwrap_or_default()).unwrap_or_else(|_| "[]".to_string());
            let images = serde_json::to_string(&d.get("images").and_then(|v| v.as_array()).cloned().unwrap_or_default()).unwrap_or_else(|_| "[]".to_string());
            let content_blocks = serde_json::to_string(&d.get("content_blocks").and_then(|v| v.as_array()).cloned().unwrap_or_default()).unwrap_or_else(|_| "[]".to_string());
            let _ = db.conn.execute(
                "UPDATE requirements SET title=?, description=?, category=?, module=?, priority=?, status=?, assignee=?, creator=?, due_date=?, tags=?, images=?, content_blocks=?, updated_at=datetime('now','localtime') WHERE id=?",
                params![
                    d.get("title").and_then(|v| v.as_str()).unwrap_or(""),
                    d.get("description").and_then(|v| v.as_str()).unwrap_or(""),
                    d.get("category").and_then(|v| v.as_str()).unwrap_or(""),
                    d.get("module").and_then(|v| v.as_str()).unwrap_or("用户端"),
                    d.get("priority").and_then(|v| v.as_str()).unwrap_or(""),
                    d.get("status").and_then(|v| v.as_str()).unwrap_or(""),
                    d.get("assignee").and_then(|v| v.as_str()).unwrap_or(""),
                    d.get("creator").and_then(|v| v.as_str()).unwrap_or(""),
                    d.get("dueDate").and_then(|v| v.as_str()).unwrap_or(""),
                    tags,
                    images,
                    content_blocks,
                    id,
                ],
            );
            serde_json::json!({ "success": true })
        }
        "DELETE" => {
            if let Some(id) = id {
                let _ = db.conn.execute("DELETE FROM requirements WHERE id = ?", params![id]);
            }
            serde_json::json!({ "success": true })
        }
        _ => serde_json::json!({ "error": "Unknown method" }),
    }
}

fn format_req_row(row: &rusqlite::Row) -> JsonValue {
    serde_json::json!({
        "id": row.get::<_, i64>(0).unwrap_or(0),
        "title": row.get::<_, String>(1).unwrap_or_default(),
        "desc": row.get::<_, String>(2).unwrap_or_default(),
        "category": row.get::<_, String>(3).unwrap_or_default(),
        "module": row.get::<_, String>(4).unwrap_or_else(|_| "用户端".to_string()),
        "priority": row.get::<_, String>(5).unwrap_or_default(),
        "status": row.get::<_, String>(6).unwrap_or_default(),
        "assignee": row.get::<_, String>(7).unwrap_or_default(),
        "creator": row.get::<_, String>(8).unwrap_or_default(),
        "dueDate": row.get::<_, String>(9).unwrap_or_default(),
        "tags": serde_json::from_str(&row.get::<_, String>(10).unwrap_or_else(|_| "[]".to_string())).unwrap_or(serde_json::Value::Array(vec![])),
        "images": serde_json::from_str(&row.get::<_, String>(11).unwrap_or_else(|_| "[]".to_string())).unwrap_or(serde_json::Value::Array(vec![])),
        "aiSummary": row.get::<_, String>(12).unwrap_or_default(),
        "aiTags": serde_json::from_str(&row.get::<_, String>(13).unwrap_or_else(|_| "[]".to_string())).unwrap_or(serde_json::Value::Array(vec![])),
        "imageDescriptions": serde_json::from_str(&row.get::<_, String>(14).unwrap_or_else(|_| "[]".to_string())).unwrap_or(serde_json::Value::Array(vec![])),
        "workflowHandler": row.get::<_, String>(15).unwrap_or_default(),
        "workflowHistory": serde_json::from_str(&row.get::<_, String>(16).unwrap_or_else(|_| "[]".to_string())).unwrap_or(serde_json::Value::Array(vec![])),
        "createdAt": row.get::<_, String>(17).unwrap_or_default(),
        "updatedAt": row.get::<_, String>(18).unwrap_or_default(),
        "contentBlocks": serde_json::from_str(&row.get::<_, String>(19).unwrap_or_else(|_| "[]".to_string())).unwrap_or(serde_json::Value::Array(vec![])),
    })
}

fn handle_documents(db: &DbState, method: &str, data: Option<&JsonValue>, id: Option<i64>) -> JsonValue {
    match method {
        "GET" => {
            if let Some(id) = id {
                let mut stmt = match db.conn.prepare("SELECT id, title, category, type, size, views, stars, date, tags, featured, file_path, content, image_descriptions, created_at FROM documents WHERE id = ?") {
                    Ok(s) => s,
                    Err(_) => return serde_json::json!({ "error": "Query failed" }),
                };
                let mut rows = match stmt.query(params![id]) {
                    Ok(r) => r,
                    Err(_) => return serde_json::json!({ "error": "Query failed" }),
                };
                if let Ok(Some(row)) = rows.next() {
                    return format_doc_row(row);
                }
                serde_json::json!({ "error": "Not found" })
            } else {
                let mut stmt = match db.conn.prepare("SELECT id, title, category, type, size, views, stars, date, tags, featured, created_at FROM documents ORDER BY created_at DESC") {
                    Ok(s) => s,
                    Err(_) => return serde_json::json!([]),
                };
                let mut rows = match stmt.query([]) {
                    Ok(r) => r,
                    Err(_) => return serde_json::json!([]),
                };
                let mut result = vec![];
                while let Ok(Some(row)) = rows.next() {
                    result.push(serde_json::json!({
                        "id": row.get::<_, i64>(0).unwrap_or(0),
                        "title": row.get::<_, String>(1).unwrap_or_default(),
                        "category": row.get::<_, String>(2).unwrap_or_default(),
                        "type": row.get::<_, String>(3).unwrap_or_default(),
                        "size": row.get::<_, String>(4).unwrap_or_default(),
                        "views": row.get::<_, i64>(5).unwrap_or(0),
                        "stars": row.get::<_, i64>(6).unwrap_or(0),
                        "date": row.get::<_, String>(7).unwrap_or_default(),
                        "tags": serde_json::from_str(&row.get::<_, String>(8).unwrap_or_else(|_| "[]".to_string())).unwrap_or(serde_json::Value::Array(vec![])),
                        "featured": row.get::<_, i64>(9).unwrap_or(0) == 1,
                    }));
                }
                serde_json::json!(result)
            }
        }
        "POST" => {
            let d = data.unwrap_or(&serde_json::Value::Null);
            let tags = serde_json::to_string(&d.get("tags").and_then(|v| v.as_array()).cloned().unwrap_or_default()).unwrap_or_else(|_| "[]".to_string());
            let _ = db.conn.execute(
                "INSERT INTO documents (title, category, type, size, date, tags, featured, content, file_path) VALUES (?,?,?,?,?,?,?,?,?)",
                params![
                    d.get("title").and_then(|v| v.as_str()).unwrap_or(""),
                    d.get("category").and_then(|v| v.as_str()).unwrap_or("guide"),
                    d.get("type").and_then(|v| v.as_str()).unwrap_or("MD"),
                    d.get("size").and_then(|v| v.as_str()).unwrap_or(""),
                    d.get("date").and_then(|v| v.as_str()).unwrap_or(""),
                    tags,
                    d.get("featured").and_then(|v| v.as_bool()).unwrap_or(false),
                    d.get("content").and_then(|v| v.as_str()).unwrap_or(""),
                    d.get("file_path").and_then(|v| v.as_str()).unwrap_or(""),
                ],
            );
            serde_json::json!({ "success": true, "id": db.last_insert_rowid() })
        }
        "PUT" => {
            let Some(id) = id else { return serde_json::json!({ "error": "No id" }); };
            let d = data.unwrap_or(&serde_json::Value::Null);
            let tags = serde_json::to_string(&d.get("tags").and_then(|v| v.as_array()).cloned().unwrap_or_default()).unwrap_or_else(|_| "[]".to_string());
            let _ = db.conn.execute(
                "UPDATE documents SET title=?, category=?, type=?, size=?, date=?, tags=?, featured=?, content=? WHERE id=?",
                params![
                    d.get("title").and_then(|v| v.as_str()).unwrap_or(""),
                    d.get("category").and_then(|v| v.as_str()).unwrap_or(""),
                    d.get("type").and_then(|v| v.as_str()).unwrap_or(""),
                    d.get("size").and_then(|v| v.as_str()).unwrap_or(""),
                    d.get("date").and_then(|v| v.as_str()).unwrap_or(""),
                    tags,
                    d.get("featured").and_then(|v| v.as_bool()).unwrap_or(false),
                    d.get("content").and_then(|v| v.as_str()).unwrap_or(""),
                    id,
                ],
            );
            serde_json::json!({ "success": true })
        }
        "DELETE" => {
            if let Some(id) = id {
                let _ = db.conn.execute("DELETE FROM documents WHERE id = ?", params![id]);
            }
            serde_json::json!({ "success": true })
        }
        _ => serde_json::json!({ "error": "Unknown method" }),
    }
}

fn format_doc_row(row: &rusqlite::Row) -> JsonValue {
    serde_json::json!({
        "id": row.get::<_, i64>(0).unwrap_or(0),
        "title": row.get::<_, String>(1).unwrap_or_default(),
        "category": row.get::<_, String>(2).unwrap_or_default(),
        "type": row.get::<_, String>(3).unwrap_or_default(),
        "size": row.get::<_, String>(4).unwrap_or_default(),
        "views": row.get::<_, i64>(5).unwrap_or(0),
        "stars": row.get::<_, i64>(6).unwrap_or(0),
        "date": row.get::<_, String>(7).unwrap_or_default(),
        "tags": serde_json::from_str(&row.get::<_, String>(8).unwrap_or_else(|_| "[]".to_string())).unwrap_or(serde_json::Value::Array(vec![])),
        "featured": row.get::<_, i64>(9).unwrap_or(0) == 1,
        "file_path": row.get::<_, String>(10).unwrap_or_default(),
        "content": row.get::<_, String>(11).unwrap_or_default(),
        "imageDescriptions": serde_json::from_str(&row.get::<_, String>(12).unwrap_or_else(|_| "[]".to_string())).unwrap_or(serde_json::Value::Array(vec![])),
        "createdAt": row.get::<_, String>(13).unwrap_or_default(),
    })
}

fn handle_mcp(db: &DbState, method: &str, data: Option<&JsonValue>, id: Option<i64>) -> JsonValue {
    match method {
        "GET" => {
            let mut stmt = match db.conn.prepare("SELECT id, name, type, command, args, env, enabled, config, created_at FROM mcp_servers ORDER BY id DESC") {
                Ok(s) => s,
                Err(_) => return serde_json::json!([]),
            };
            let mut rows = match stmt.query([]) {
                Ok(r) => r,
                Err(_) => return serde_json::json!([]),
            };
            let mut result = vec![];
            while let Ok(Some(row)) = rows.next() {
                result.push(serde_json::json!({
                    "id": row.get::<_, i64>(0).unwrap_or(0),
                    "name": row.get::<_, String>(1).unwrap_or_default(),
                    "type": row.get::<_, String>(2).unwrap_or_default(),
                    "command": row.get::<_, String>(3).unwrap_or_default(),
                    "args": serde_json::from_str(&row.get::<_, String>(4).unwrap_or_else(|_| "[]".to_string())).unwrap_or(serde_json::Value::Array(vec![])),
                    "env": serde_json::from_str(&row.get::<_, String>(5).unwrap_or_else(|_| "{}".to_string())).unwrap_or(serde_json::Value::Object(Default::default())),
                    "enabled": row.get::<_, i64>(6).unwrap_or(0) == 1,
                    "config": serde_json::from_str(&row.get::<_, String>(7).unwrap_or_else(|_| "{}".to_string())).unwrap_or(serde_json::Value::Object(Default::default())),
                    "createdAt": row.get::<_, String>(8).unwrap_or_default(),
                }));
            }
            serde_json::json!(result)
        }
        "POST" => {
            let d = data.unwrap_or(&serde_json::Value::Null);
            let args = serde_json::to_string(&d.get("args").and_then(|v| v.as_array()).cloned().unwrap_or_default()).unwrap_or_else(|_| "[]".to_string());
            let env = serde_json::to_string(&d.get("env").and_then(|v| v.as_object()).cloned().unwrap_or_default()).unwrap_or_else(|_| "{}".to_string());
            let config = serde_json::to_string(&d.get("config").and_then(|v| v.as_object()).cloned().unwrap_or_default()).unwrap_or_else(|_| "{}".to_string());
            let _ = db.conn.execute(
                "INSERT INTO mcp_servers (name, type, command, args, env, config) VALUES (?,?,?,?,?,?)",
                params![
                    d.get("name").and_then(|v| v.as_str()).unwrap_or(""),
                    d.get("type").and_then(|v| v.as_str()).unwrap_or(""),
                    d.get("command").and_then(|v| v.as_str()).unwrap_or(""),
                    args,
                    env,
                    config,
                ],
            );
            serde_json::json!({ "success": true })
        }
        "PUT" => {
            let Some(id) = id else { return serde_json::json!({ "error": "No id" }); };
            let d = data.unwrap_or(&serde_json::Value::Null);
            let mut updates = vec![];
            let mut values: Vec<Box<dyn rusqlite::ToSql>> = vec![];

            if let Some(v) = d.get("enabled") {
                updates.push("enabled=?");
                values.push(Box::new(if v.as_bool().unwrap_or(false) { 1 } else { 0 }));
            }
            if let Some(v) = d.get("config") {
                updates.push("config=?");
                values.push(Box::new(serde_json::to_string(&v).unwrap_or_default()));
            }
            if let Some(v) = d.get("name") {
                updates.push("name=?");
                values.push(Box::new(v.as_str().unwrap_or("").to_string()));
            }
            if let Some(v) = d.get("type") {
                updates.push("type=?");
                values.push(Box::new(v.as_str().unwrap_or("").to_string()));
            }
            if let Some(v) = d.get("command") {
                updates.push("command=?");
                values.push(Box::new(v.as_str().unwrap_or("").to_string()));
            }
            if let Some(v) = d.get("args") {
                updates.push("args=?");
                values.push(Box::new(serde_json::to_string(&v).unwrap_or_default()));
            }
            if let Some(v) = d.get("env") {
                updates.push("env=?");
                values.push(Box::new(serde_json::to_string(&v).unwrap_or_default()));
            }

            if !updates.is_empty() {
                values.push(Box::new(id));
                let sql = format!("UPDATE mcp_servers SET {} WHERE id=?", updates.join(","));
                let params: Vec<&dyn rusqlite::ToSql> = values.iter().map(|b| b.as_ref()).collect();
                let _ = db.conn.execute(&sql, params.as_slice());
            }
            serde_json::json!({ "success": true })
        }
        "DELETE" => {
            if let Some(id) = id {
                let _ = db.conn.execute("DELETE FROM mcp_servers WHERE id = ?", params![id]);
            }
            serde_json::json!({ "success": true })
        }
        _ => serde_json::json!({ "error": "Unknown method" }),
    }
}

fn handle_models(db: &DbState, method: &str, data: Option<&JsonValue>, id: Option<i64>) -> JsonValue {
    match method {
        "GET" => {
            let mut stmt = match db.conn.prepare("SELECT id, name, provider, base_url, api_key, model_id, enabled, is_default, config, created_at FROM models ORDER BY is_default DESC, id DESC") {
                Ok(s) => s,
                Err(_) => return serde_json::json!([]),
            };
            let mut rows = match stmt.query([]) {
                Ok(r) => r,
                Err(_) => return serde_json::json!([]),
            };
            let mut result = vec![];
            while let Ok(Some(row)) = rows.next() {
                let api_key_raw = row.get::<_, String>(4).unwrap_or_default();
                let decrypted = decrypt_api_key(&api_key_raw);
                let masked = if decrypted.is_empty() {
                    String::new()
                } else {
                    format!("******{}", &decrypted[decrypted.len().saturating_sub(4)..])
                };
                result.push(serde_json::json!({
                    "id": row.get::<_, i64>(0).unwrap_or(0),
                    "name": row.get::<_, String>(1).unwrap_or_default(),
                    "provider": row.get::<_, String>(2).unwrap_or_default(),
                    "baseUrl": row.get::<_, String>(3).unwrap_or_default(),
                    "apiKey": masked,
                    "hasApiKey": !api_key_raw.is_empty(),
                    "modelId": row.get::<_, String>(5).unwrap_or_default(),
                    "enabled": row.get::<_, i64>(6).unwrap_or(0) == 1,
                    "isDefault": row.get::<_, i64>(7).unwrap_or(0) == 1,
                    "createdAt": row.get::<_, String>(9).unwrap_or_default(),
                }));
            }
            serde_json::json!(result)
        }
        "POST" => {
            let d = data.unwrap_or(&serde_json::Value::Null);
            let name = d.get("name").and_then(|v| v.as_str()).unwrap_or("");
            let display_name = if name.is_empty() {
                format!("{} - {}", d.get("provider").and_then(|v| v.as_str()).unwrap_or(""), d.get("modelId").and_then(|v| v.as_str()).unwrap_or(""))
            } else { name.to_string() };
            let encrypted = encrypt_api_key(d.get("apiKey").and_then(|v| v.as_str()).unwrap_or(""));
            let _ = db.conn.execute(
                "INSERT INTO models (name, provider, base_url, api_key, model_id, enabled) VALUES (?,?,?,?,?,1)",
                params![
                    display_name,
                    d.get("provider").and_then(|v| v.as_str()).unwrap_or(""),
                    d.get("baseUrl").and_then(|v| v.as_str()).unwrap_or(""),
                    encrypted,
                    d.get("modelId").and_then(|v| v.as_str()).unwrap_or(""),
                ],
            );
            serde_json::json!({ "success": true, "id": db.last_insert_rowid() })
        }
        "PUT" => {
            let Some(id) = id else { return serde_json::json!({ "error": "No id" }); };
            let d = data.unwrap_or(&serde_json::Value::Null);
            let mut updates = vec![];
            let mut values: Vec<Box<dyn rusqlite::ToSql>> = vec![];

            if let Some(v) = d.get("is_default") {
                updates.push("is_default=?");
                values.push(Box::new(if v.as_bool().unwrap_or(false) { 1 } else { 0 }));
            }
            if let Some(v) = d.get("name") {
                updates.push("name=?");
                values.push(Box::new(v.as_str().unwrap_or("").to_string()));
            }
            if let Some(v) = d.get("apiKey") {
                updates.push("api_key=?");
                values.push(Box::new(encrypt_api_key(v.as_str().unwrap_or(""))));
            }
            if let Some(v) = d.get("modelId") {
                updates.push("model_id=?");
                values.push(Box::new(v.as_str().unwrap_or("").to_string()));
            }
            if let Some(v) = d.get("enabled") {
                updates.push("enabled=?");
                values.push(Box::new(if v.as_bool().unwrap_or(false) { 1 } else { 0 }));
            }

            if !updates.is_empty() {
                values.push(Box::new(id));
                let sql = format!("UPDATE models SET {} WHERE id=?", updates.join(","));
                let params: Vec<&dyn rusqlite::ToSql> = values.iter().map(|b| b.as_ref()).collect();
                let _ = db.conn.execute(&sql, params.as_slice());
            }
            serde_json::json!({ "success": true })
        }
        "DELETE" => {
            if let Some(id) = id {
                let _ = db.conn.execute("DELETE FROM models WHERE id = ?", params![id]);
            }
            serde_json::json!({ "success": true })
        }
        _ => serde_json::json!({ "error": "Unknown method" }),
    }
}

fn dashboard_stats(db: &DbState) -> JsonValue {
    let mut stmt = match db.conn.prepare("SELECT COUNT(*), SUM(CASE WHEN status='已完成' THEN 1 ELSE 0 END), SUM(CASE WHEN status='实现中' THEN 1 ELSE 0 END) FROM requirements") {
        Ok(s) => s,
        Err(_) => return serde_json::json!([]),
    };
    let mut rows = match stmt.query([]) {
        Ok(r) => r,
        Err(_) => return serde_json::json!([]),
    };
    let (total, completed, in_progress) = if let Ok(Some(row)) = rows.next() {
        (
            row.get::<_, i64>(0).unwrap_or(0),
            row.get::<_, i64>(1).unwrap_or(0),
            row.get::<_, i64>(2).unwrap_or(0),
        )
    } else { (0, 0, 0) };

    let doc_count: i64 = db.conn.query_row("SELECT COUNT(*) FROM documents", [], |row| row.get(0)).unwrap_or(0);

    serde_json::json!([
        serde_json::json!({ "label": "需求总数", "value": total.to_string(), "change": format!("+{}", total), "icon": "SparklesIcon", "color": "#6366f1", "bg": "rgba(99,102,241,0.12)" }),
        serde_json::json!({ "label": "完成率", "value": if total > 0 { format!("{}%", (completed as f64 / total as f64 * 100.0).round() as i64) } else { "0%".to_string() }, "change": format!("{} 已完成", completed), "icon": "CheckCircleIcon", "color": "#10b981", "bg": "rgba(16,185,129,0.12)" }),
        serde_json::json!({ "label": "进行中", "value": in_progress.to_string(), "change": format!("{} 项", in_progress), "icon": "ZapIcon", "color": "#f59e0b", "bg": "rgba(245,158,11,0.12)" }),
        serde_json::json!({ "label": "知识文档", "value": doc_count.to_string(), "change": format!("{} 篇", doc_count), "icon": "DatabaseIcon", "color": "#06b6d4", "bg": "rgba(6,182,212,0.12)" }),
    ])
}

fn dashboard_charts(db: &DbState) -> JsonValue {
    let total: i64 = db.conn.query_row("SELECT COUNT(*) FROM requirements", [], |row| row.get(0)).unwrap_or(0);
    let doc_count: i64 = db.conn.query_row("SELECT COUNT(*) FROM documents", [], |row| row.get(0)).unwrap_or(0);

    let mut stmt = match db.conn.prepare("SELECT category, COUNT(*) FROM requirements GROUP BY category") {
        Ok(s) => s,
        Err(_) => return serde_json::json!({ "areaData": [], "barData": [] }),
    };
    let mut rows = match stmt.query([]) {
        Ok(r) => r,
        Err(_) => return serde_json::json!({ "areaData": [], "barData": [] }),
    };
    let mut bar_data = vec![];
    while let Ok(Some(row)) = rows.next() {
        let name: String = row.get(0).unwrap_or_default();
        let value: i64 = row.get(1).unwrap_or(0);
        bar_data.push(serde_json::json!({ "name": name, "value": value }));
    }

    serde_json::json!({
        "areaData": [
            serde_json::json!({ "name": "1月", "需求": 0, "知识": 0, "洞察分析": 0 }),
            serde_json::json!({ "name": "2月", "需求": 0, "知识": 0, "洞察分析": 0 }),
            serde_json::json!({ "name": "3月", "需求": 0, "知识": 0, "洞察分析": 0 }),
            serde_json::json!({ "name": "4月", "需求": 0, "知识": 0, "洞察分析": 0 }),
            serde_json::json!({ "name": "5月", "需求": total, "知识": doc_count, "洞察分析": 0 }),
            serde_json::json!({ "name": "6月", "需求": 0, "知识": 0, "洞察分析": 0 }),
            serde_json::json!({ "name": "7月", "需求": 0, "知识": 0, "洞察分析": 0 }),
        ],
        "barData": bar_data,
    })
}

fn dashboard_activities(db: &DbState) -> JsonValue {
    let mut stmt = match db.conn.prepare("SELECT id, title, status, updated_at FROM requirements ORDER BY updated_at DESC LIMIT 10") {
        Ok(s) => s,
        Err(_) => return serde_json::json!([]),
    };
    let mut rows = match stmt.query([]) {
        Ok(r) => r,
        Err(_) => return serde_json::json!([]),
    };
    let icon_map = std::collections::HashMap::from([
        ("待评估", "AlertCircleIcon"), ("设计中", "EditIcon"), ("实现中", "ArrowUpIcon"), ("测试中", "SearchIcon"), ("已完成", "CheckCircleIcon"),
    ]);
    let color_map = std::collections::HashMap::from([
        ("待评估", "#f59e0b"), ("设计中", "#6366f1"), ("实现中", "#06b6d4"), ("测试中", "#8b5cf6"), ("已完成", "#10b981"),
    ]);
    let mut result = vec![];
    while let Ok(Some(row)) = rows.next() {
        let status: String = row.get(2).unwrap_or_default();
        result.push(serde_json::json!({
            "id": row.get::<_, i64>(0).unwrap_or(0),
            "icon": icon_map.get(status.as_str()).unwrap_or(&"ClockIcon"),
            "color": color_map.get(status.as_str()).unwrap_or(&"#888"),
            "text": row.get::<_, String>(1).unwrap_or_default(),
            "time": row.get::<_, String>(3).unwrap_or_default(),
        }));
    }
    serde_json::json!(result)
}

fn insights_kpis(db: &DbState) -> JsonValue {
    let total_req: i64 = db.conn.query_row("SELECT COUNT(*) FROM requirements", [], |row| row.get(0)).unwrap_or(0);
    let completed_req: i64 = db.conn.query_row("SELECT COUNT(*) FROM requirements WHERE status='已完成'", [], |row| row.get(0)).unwrap_or(0);
    let doc_count: i64 = db.conn.query_row("SELECT COUNT(*) FROM documents", [], |row| row.get(0)).unwrap_or(0);
    serde_json::json!([
        serde_json::json!({ "label": "需求总数", "value": total_req.to_string(), "change": "0", "up": true }),
        serde_json::json!({ "label": "完成率", "value": if total_req > 0 { format!("{}%", (completed_req as f64 / total_req as f64 * 100.0).round() as i64) } else { "0%".to_string() }, "change": "0%", "up": true }),
        serde_json::json!({ "label": "知识文档", "value": doc_count.to_string(), "change": "0", "up": true }),
    ])
}

fn insights_charts(db: &DbState) -> JsonValue {
    let mut bar_stmt = match db.conn.prepare("SELECT category, COUNT(*) FROM documents GROUP BY category") {
        Ok(s) => s,
        Err(_) => return serde_json::json!({ "barData": [], "pieData": [] }),
    };
    let mut bar_rows = match bar_stmt.query([]) {
        Ok(r) => r,
        Err(_) => return serde_json::json!({ "barData": [], "pieData": [] }),
    };
    let mut bar_data = vec![];
    while let Ok(Some(row)) = bar_rows.next() {
        bar_data.push(serde_json::json!({
            "name": row.get::<_, String>(0).unwrap_or_default(),
            "value": row.get::<_, i64>(1).unwrap_or(0),
        }));
    }

    let mut pie_stmt = match db.conn.prepare("SELECT type, COUNT(*) FROM documents GROUP BY type") {
        Ok(s) => s,
        Err(_) => return serde_json::json!({ "barData": bar_data, "pieData": [] }),
    };
    let mut pie_rows = match pie_stmt.query([]) {
        Ok(r) => r,
        Err(_) => return serde_json::json!({ "barData": bar_data, "pieData": [] }),
    };
    let mut pie_data = vec![];
    while let Ok(Some(row)) = pie_rows.next() {
        pie_data.push(serde_json::json!({
            "name": row.get::<_, String>(0).unwrap_or_default(),
            "value": row.get::<_, i64>(1).unwrap_or(0),
        }));
    }

    serde_json::json!({ "barData": bar_data, "pieData": pie_data })
}

fn handle_ai_insights(_db: &DbState, method: &str) -> JsonValue {
    if method == "POST" {
        serde_json::json!({ "error": "AI insights not yet implemented in Tauri version" })
    } else {
        serde_json::json!([])
    }
}

fn storage_stats(_db: &DbState) -> JsonValue {
    let uploads_dir = dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("workit")
        .join("uploads");
    if !uploads_dir.exists() {
        return serde_json::json!({ "usedBytes": 0 });
    }
    let files = std::fs::read_dir(&uploads_dir).map(|f| f.filter_map(|e| e.ok()).map(|e| e.path()).collect::<Vec<_>>()).unwrap_or_default();
    let mut used_bytes: u64 = 0;
    for f in files {
        if let Ok(meta) = std::fs::metadata(&f) {
            used_bytes += meta.len();
        }
    }
    serde_json::json!({ "usedBytes": used_bytes })
}

fn handle_resource_action(db: &DbState, res_type: &str, res_id: i64, action: &str) -> JsonValue {
    match action {
        "analyze" => {
            let desc: String = if res_type == "requirements" {
                db.conn.query_row("SELECT description FROM requirements WHERE id = ?", params![res_id], |row| row.get(0)).unwrap_or_default()
            } else {
                String::new()
            };
            if desc.is_empty() {
                return serde_json::json!({ "error": "No description to analyze" });
            }
            serde_json::json!({ "success": true, "aiSummary": "", "aiTags": [], "imageDescriptions": [] })
        }
        _ => serde_json::json!({ "error": "Unknown action" }),
    }
}

pub fn handle_upload(_db: &DbState, _table: &str, file_data: Vec<u8>) -> Result<JsonValue, String> {
    let uploads_dir = dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("workit")
        .join("uploads");
    std::fs::create_dir_all(&uploads_dir).map_err(|e| e.to_string())?;
    let filename = format!("{}-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis(), rand_u64());
    let file_path = uploads_dir.join(format!("{}.bin", filename));
    std::fs::write(&file_path, &file_data).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "url": format!("/uploads/{}.bin", filename) }))
}

fn rand_u64() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos() as u64
}