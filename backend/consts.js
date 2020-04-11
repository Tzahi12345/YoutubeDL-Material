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

    // Encryption
    'ytdl_use_encryption': {
        'key': 'ytdl_use_encryption',
        'path': 'YoutubeDLMaterial.Encryption.use-encryption'
    },
    'ytdl_cert_file_path': {
        'key': 'ytdl_cert_file_path',
        'path': 'YoutubeDLMaterial.Encryption.cert-file-path'
    },
    'ytdl_key_file_path': {
        'key': 'ytdl_key_file_path',
        'path': 'YoutubeDLMaterial.Encryption.key-file-path'
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
    'ytdl_settings_pin_required': {
        'key': 'ytdl_settings_pin_required',
        'path': 'YoutubeDLMaterial.Extra.settings_pin_required'
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
    'ytdl_subscriptions_use_youtubedl_archive': {
        'key': 'ytdl_use_youtubedl_archive',
        'path': 'YoutubeDLMaterial.Subscriptions.subscriptions_use_youtubedl_archive'
    },

    // Advanced
    'ytdl_use_default_downloading_agent': {
        'key': 'ytdl_use_default_downloading_agent',
        'path': 'YoutubeDLMaterial.Advanced.use_default_downloading_agent'
    },
    'ytdl_custom_downloading_agent': {
        'key': 'ytdl_custom_downloading_agent',
        'path': 'YoutubeDLMaterial.Advanced.custom_downloading_agent'
    },
    'ytdl_allow_advanced_download': {
        'key': 'ytdl_allow_advanced_download',
        'path': 'YoutubeDLMaterial.Advanced.allow_advanced_download'
    },
};

module.exports = {
    CONFIG_ITEMS: CONFIG_ITEMS,
    CURRENT_VERSION: 'v3.6.0'
}