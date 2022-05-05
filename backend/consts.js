exports.CONFIG_ITEMS = {
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
    'ytdl_default_file_output': {
        'key': 'ytdl_default_file_output',
        'path': 'YoutubeDLMaterial.Downloader.default_file_output'
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
    'ytdl_max_concurrent_downloads': {
        'key': 'ytdl_max_concurrent_downloads',
        'path': 'YoutubeDLMaterial.Downloader.max_concurrent_downloads'
    },
    'ytdl_download_rate_limit': {
        'key': 'ytdl_download_rate_limit',
        'path': 'YoutubeDLMaterial.Downloader.download_rate_limit'
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
    'ytdl_allow_autoplay': {
        'key': 'ytdl_allow_autoplay',
        'path': 'YoutubeDLMaterial.Extra.allow_autoplay'
    },
    'ytdl_enable_downloads_manager': {
        'key': 'ytdl_enable_downloads_manager',
        'path': 'YoutubeDLMaterial.Extra.enable_downloads_manager'
    },
    'ytdl_allow_playlist_categorization': {
        'key': 'ytdl_allow_playlist_categorization',
        'path': 'YoutubeDLMaterial.Extra.allow_playlist_categorization'
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
    'ytdl_use_twitch_api': {
        'key': 'ytdl_use_twitch_api',
        'path': 'YoutubeDLMaterial.API.use_twitch_API'
    },
    'ytdl_twitch_api_key': {
        'key': 'ytdl_twitch_api_key',
        'path': 'YoutubeDLMaterial.API.twitch_API_key'
    },
    'ytdl_twitch_auto_download_chat': {
        'key': 'ytdl_twitch_auto_download_chat',
        'path': 'YoutubeDLMaterial.API.twitch_auto_download_chat'
    },
    'ytdl_use_sponsorblock_api': {
        'key': 'ytdl_use_sponsorblock_api',
        'path': 'YoutubeDLMaterial.API.use_sponsorblock_API'
    },
    'ytdl_generate_nfo_files': {
        'key': 'ytdl_generate_nfo_files',
        'path': 'YoutubeDLMaterial.API.generate_NFO_files'
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
    'ytdl_subscriptions_redownload_fresh_uploads': {
        'key': 'ytdl_subscriptions_redownload_fresh_uploads',
        'path': 'YoutubeDLMaterial.Subscriptions.redownload_fresh_uploads'
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

    // Database
    'ytdl_use_local_db': {
        'key': 'ytdl_use_local_db',
        'path': 'YoutubeDLMaterial.Database.use_local_db'
    },
    'ytdl_mongodb_connection_string': {
        'key': 'ytdl_mongodb_connection_string',
        'path': 'YoutubeDLMaterial.Database.mongodb_connection_string'
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

exports.AVAILABLE_PERMISSIONS = [
    'filemanager',
    'settings',
    'subscriptions',
    'sharing',
    'advanced_download',
    'downloads_manager'
];

exports.DETAILS_BIN_PATH = 'node_modules/youtube-dl/bin/details'

// args that have a value after it (e.g. -o <output> or -f <format>)
const YTDL_ARGS_WITH_VALUES = [
    '--default-search',
    '--config-location',
    '--proxy',
    '--socket-timeout',
    '--source-address',
    '--geo-verification-proxy',
    '--geo-bypass-country',
    '--geo-bypass-ip-block',
    '--playlist-start',
    '--playlist-end',
    '--playlist-items',
    '--match-title',
    '--reject-title',
    '--max-downloads',
    '--min-filesize',
    '--max-filesize',
    '--date',
    '--datebefore',
    '--dateafter',
    '--min-views',
    '--max-views',
    '--match-filter',
    '--age-limit',
    '--download-archive',
    '-r',
    '--limit-rate',
    '-R',
    '--retries',
    '--fragment-retries',
    '--buffer-size',
    '--http-chunk-size',
    '--external-downloader',
    '--external-downloader-args',
    '-a',
    '--batch-file',
    '-o',
    '--output',
    '--output-na-placeholder',
    '--autonumber-start',
    '--load-info-json',
    '--cookies',
    '--cache-dir',
    '--encoding',
    '--user-agent',
    '--referer',
    '--add-header',
    '--sleep-interval',
    '--max-sleep-interval',
    '-f',
    '--format',
    '--merge-output-format',
    '--sub-format',
    '--sub-lang',
    '-u',
    '--username',
    '-p',
    '--password',
    '-2',
    '--twofactor',
    '--video-password',
    '--ap-mso',
    '--ap-username',
    '--ap-password',
    '--audio-format',
    '--audio-quality',
    '--recode-video',
    '--postprocessor-args',
    '--metadata-from-title',
    '--fixup',
    '--ffmpeg-location',
    '--exec',
    '--convert-subs'
];

// we're using a Set here for performance
exports.YTDL_ARGS_WITH_VALUES = new Set(YTDL_ARGS_WITH_VALUES);

exports.CURRENT_VERSION = 'v4.2';
