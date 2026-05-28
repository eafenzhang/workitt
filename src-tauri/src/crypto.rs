use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};

pub fn encrypt_api_key(plain_text: &str) -> String {
    if plain_text.is_empty() {
        return String::new();
    }
    // For now, since Tauri doesn't have safeStorage equivalent,
    // we'll use a simple XOR-based obfuscation with machine-specific key
    // In production, you'd want something more robust like ring or windows-sys
    let machine_id = get_machine_id();
    let key_bytes = machine_id.as_bytes();
    let data = plain_text.as_bytes();
    let mut result = vec![];
    for (i, byte) in data.iter().enumerate() {
        result.push(byte ^ key_bytes[i % key_bytes.len()]);
    }
    BASE64.encode(&result)
}

pub fn decrypt_api_key(stored: &str) -> String {
    if stored.is_empty() {
        return String::new();
    }
    let Ok(decoded) = BASE64.decode(stored) else {
        // Not base64 encoded, might be plain text (old format)
        return stored.to_string();
    };
    let machine_id = get_machine_id();
    let key_bytes = machine_id.as_bytes();
    let mut result = vec![];
    for (i, byte) in decoded.iter().enumerate() {
        result.push(byte ^ key_bytes[i % key_bytes.len()]);
    }
    String::from_utf8(result).unwrap_or_else(|_| stored.to_string())
}

fn get_machine_id() -> String {
    // Use a combination of username and computername as machine ID
    // This is a simple approach - the encrypted data can be decrypted on the same machine
    let username = std::env::var("USERNAME").unwrap_or_else(|_| "default".to_string());
    let computername = std::env::var("COMPUTERNAME").unwrap_or_else(|_| "pc".to_string());
    format!("{}@{}", username, computername)
}