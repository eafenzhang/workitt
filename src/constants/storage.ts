/** localStorage key constants — unified naming convention */
export const STORAGE_KEYS = {
  THEME: 'workit_theme',
  USER_PROFILE: 'workit_user_profile',
  AGENT_OS_MODE: 'workit_agent_os_mode',
  AGENT_OS_WINDOWS: 'workit_agent_os_windows',
  AGENT_OS_WALLPAPER: 'workit_agent_os_wallpaper',
  AGENT_OS_DOCK_FS: 'workit_agent_os_dock_fullscreen',
  BROWSER_BOOKMARKS: 'workit_browser_bookmarks',
  BROWSER_HISTORY: 'workit_browser_history',
  HOME_CONVERSATIONS: 'workit_home_conversations',
  HOME_LAST_MODEL: 'workit_home_last_model',
  QUICK_COLLECT_ENABLED: 'workit_quick_collect_enabled',
  AI_AUTO_ANALYZE: 'workit_ai_auto_analyze',
  MODEL_TOKEN_USAGE: 'workit_model_token_usage',
} as const;
