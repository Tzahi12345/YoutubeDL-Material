let CONFIG_ITEMS = {
    // Host
    'ytdl_url': {
        'key': 'ytdl_url',
        'path': 'YoutubeDLMaterial.Host.url'
    },
    'ytdl_port': {
        'key': 'ytdl_port',
        'path': 'YoutubeDLMaterial.Host.port'
    },

    // Downloader
    'ytdl_audio_folder_path': {
        'key': 'ytdl_audio_folder_path',
        'path': 'YoutubeDLMaterial.Downloader.path-audio'
    },
    'ytdl_video_folder_path': {
        'key': 'ytdl_video_folder_path',
        'path': 'YoutubeDLMaterial.Downloader.path-video'
    },
    'ytdl_use_youtubedl_archive': {
        'key': 'ytdl_use_youtubedl_archive',
        'path': 'YoutubeDLMaterial.Downloader.use_youtubedl_archive'
    },
    'ytdl_custom_args': {
        'key': 'ytdl_custom_args',
        'path': 'YoutubeDLMaterial.Downloader.custom_args'
    },
    'ytdl_safe_download_override': {
        'key': 'ytdl_safe_download_override',
        'path': 'YoutubeDLMaterial.Downloader.safe_download_override'
    },
    'ytdl_include_thumbnail': {
        'key': 'ytdl_include_thumbnail',
        'path': 'YoutubeDLMaterial.Downloader.include_thumbnail'
    },
    'ytdl_include_metadata': {
        'key': 'ytdl_include_metadata',
        'path': 'YoutubeDLMaterial.Downloader.include_metadata'
    },

    // Extra
    'ytdl_title_top': {
        'key': 'ytdl_title_top',
        'path': 'YoutubeDLMaterial.Extra.title_top'
    },
    'ytdl_file_manager_enabled': {
        'key': 'ytdl_file_manager_enabled',
        'path': 'YoutubeDLMaterial.Extra.file_manager_enabled'
    },
    'ytdl_allow_quality_select': {
        'key': 'ytdl_allow_quality_select',
        'path': 'YoutubeDLMaterial.Extra.allow_quality_select'
    },
    'ytdl_download_only_mode': {
        'key': 'ytdl_download_only_mode',
        'path': 'YoutubeDLMaterial.Extra.download_only_mode'
    },
    'ytdl_allow_multi_download_mode': {
        'key': 'ytdl_allow_multi_download_mode',
        'path': 'YoutubeDLMaterial.Extra.allow_multi_download_mode'
    },
    'ytdl_enable_downloads_manager': {
        'key': 'ytdl_enable_downloads_manager',
        'path': 'YoutubeDLMaterial.Extra.enable_downloads_manager'
    },

    // API
    'ytdl_use_api_key': {
        'key': 'ytdl_use_api_key',
        'path': 'YoutubeDLMaterial.API.use_API_key'
    },
    'ytdl_api_key': {
        'key': 'ytdl_api_key',
        'path': 'YoutubeDLMaterial.API.API_key'
    },
    'ytdl_use_youtube_api': {
        'key': 'ytdl_use_youtube_api',
        'path': 'YoutubeDLMaterial.API.use_youtube_API'
    },
    'ytdl_youtube_api_key': {
        'key': 'ytdl_youtube_api_key',
        'path': 'YoutubeDLMaterial.API.youtube_API_key'
    },

    // Themes
    'ytdl_default_theme': {
        'key': 'ytdl_default_theme',
        'path': 'YoutubeDLMaterial.Themes.default_theme'
    },
    'ytdl_allow_theme_change': {
        'key': 'ytdl_allow_theme_change',
        'path': 'YoutubeDLMaterial.Themes.allow_theme_change'
    },

    // Subscriptions
    'ytdl_allow_subscriptions': {
        'key': 'ytdl_allow_subscriptions',
        'path': 'YoutubeDLMaterial.Subscriptions.allow_subscriptions'
    },
    'ytdl_subscriptions_base_path': {
        'key': 'ytdl_subscriptions_base_path',
        'path': 'YoutubeDLMaterial.Subscriptions.subscriptions_base_path'
    },
    'ytdl_subscriptions_check_interval': {
        'key': 'ytdl_subscriptions_check_interval',
        'path': 'YoutubeDLMaterial.Subscriptions.subscriptions_check_interval'
    },
    'ytdl_subscriptions_check_interval': {
        'key': 'ytdl_subscriptions_check_interval',
        'path': 'YoutubeDLMaterial.Subscriptions.subscriptions_check_interval'
    },

    // Users
    'ytdl_users_base_path': {
        'key': 'ytdl_users_base_path',
        'path': 'YoutubeDLMaterial.Users.base_path'
    },
    'ytdl_allow_registration': {
        'key': 'ytdl_allow_registration',
        'path': 'YoutubeDLMaterial.Users.allow_registration'
    },
    'ytdl_auth_method': {
        'key': 'ytdl_auth_method',
        'path': 'YoutubeDLMaterial.Users.auth_method'
    },
    'ytdl_ldap_config': {
        'key': 'ytdl_ldap_config',
        'path': 'YoutubeDLMaterial.Users.ldap_config'
    },

    // Advanced
    'ytdl_default_downloader': {
        'key': 'ytdl_default_downloader',
        'path': 'YoutubeDLMaterial.Advanced.default_downloader'
    },
    'ytdl_use_default_downloading_agent': {
        'key': 'ytdl_use_default_downloading_agent',
        'path': 'YoutubeDLMaterial.Advanced.use_default_downloading_agent'
    },
    'ytdl_custom_downloading_agent': {
        'key': 'ytdl_custom_downloading_agent',
        'path': 'YoutubeDLMaterial.Advanced.custom_downloading_agent'
    },
    'ytdl_multi_user_mode': {
        'key': 'ytdl_multi_user_mode',
        'path': 'YoutubeDLMaterial.Advanced.multi_user_mode'
    },
    'ytdl_allow_advanced_download': {
        'key': 'ytdl_allow_advanced_download',
        'path': 'YoutubeDLMaterial.Advanced.allow_advanced_download'
    },
    'ytdl_use_cookies': {
        'key': 'ytdl_use_cookies',
        'path': 'YoutubeDLMaterial.Advanced.use_cookies'
    },
    'ytdl_jwt_expiration': {
        'key': 'ytdl_jwt_expiration',
        'path': 'YoutubeDLMaterial.Advanced.jwt_expiration'
    },
    'ytdl_logger_level': {
        'key': 'ytdl_logger_level',
        'path': 'YoutubeDLMaterial.Advanced.logger_level'
    }
};

AVAILABLE_PERMISSIONS = [
    'filemanager',
    'settings',
    'subscriptions',
    'sharing',
    'advanced_download',
    'downloads_manager'
];

module.exports = {
    CONFIG_ITEMS: CONFIG_ITEMS,
    AVAILABLE_PERMISSIONS: AVAILABLE_PERMISSIONS,
    CURRENT_VERSION: 'v4.1'
}
