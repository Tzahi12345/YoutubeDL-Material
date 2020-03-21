const uncategorized = [
    {'key': '-h', 'alt': '--help', 'description': 'Print this help text and exit'},
    {'key': '--version', 'description': 'Print program version and exit'},
    {'key': '-U', 'alt': '--update', 'description': 'Update this program to latest version. Make sure that you have sufficient permissions (run with sudo if needed)'},
    {'key': '-i', 'alt': '--ignore-errors', 'description': 'Continue on download errors, for example to skip unavailable videos in a playlist'},
    {'key': '--abort-on-error', 'description': 'Abort downloading of further videos (in the playlist or the command line) if an error occurs'},
    {'key': '--dump-user-agent', 'description': 'Display the current browser identification'},
    {'key': '--list-extractors', 'description': 'List all supported extractors'},
    {'key': '--extractor-descriptions', 'description': 'Output descriptions of all supported extractors'},
    {'key': '--force-generic-extractor', 'description': 'Force extraction to use the generic extractor'},
    {'key': '--default-search', 'description': 'Use this prefix for unqualified URLs. For example "gvsearch2:" downloads two videos from google videos for youtube-dl "large apple". Use the value "auto" to let youtube-dl guess ("auto_warning" to emit awarning when guessing). "error" just throws an error. The default value "fixup_error" repairs broken URLs, but emits an error if this is not possible instead of searching.'},
    {'key': '--ignore-config', 'description': 'Do not read configuration files. When given in the global configuration file /etc/youtube-dl.conf: Do not read the user configuration in ~/.config/youtube-dl/config (%APPDATA%/youtube-dl/config.txt on Windows)'},
    {'key': '--config-location', 'description': 'Location of the configuration file; either the path to the config or its containing directory.'},
    {'key': '--flat-playlist', 'description': 'Do not extract the videos of a playlist, only list them.'},
    {'key': '--mark-watched', 'description': 'Mark videos watched (YouTube only)'},
    {'key': '--no-mark-watched', 'description': 'Do not mark videos watched (YouTube only)'},
    {'key': '--no-color', 'description': 'Do not emit color codes in output'}
];

const network = [
    {'key': '--proxy', 'description': 'Use the specified HTTP/HTTPS/SOCKS proxy.To enable SOCKS proxy, specify a proper scheme. For example socks5://127.0.0.1:1080/. Pass in an empty string (--proxy "") for direct connection.'},
    {'key': '--socket-timeout', 'description': 'Time to wait before giving up, in seconds'},
    {'key': '--source-address', 'description': 'Client-side IP address to bind to'},
    {'key': '-4', 'alt': '--force-ipv4', 'description': 'Make all connections via IPv4'},
    {'key': '-6', 'alt': '--force-ipv6', 'description': 'Make all connections via IPv6'}
];

const geo_restriction = [
    {'key': '--geo-verification-proxy', 'description': 'Use this proxy to verify the IP address for some geo-restricted sites. The default proxy specified by --proxy\', if the option is not present) is used for the actual downloading.'},
    {'key': '--geo-bypass', 'description': 'Bypass geographic restriction via faking X-Forwarded-For HTTP header'},
    {'key': '--no-geo-bypass', 'description': 'Do not bypass geographic restriction via faking X-Forwarded-For HTTP header'},
    {'key': '--geo-bypass-country', 'description': 'Force bypass geographic restriction with explicitly provided two-letter ISO 3166-2 country code'},
    {'key': '--geo-bypass-ip-block', 'description': 'Force bypass geographic restriction with explicitly provided IP block in CIDR notation'}
];

const video_selection = [
    {'key': '--playlist-start', 'description': 'Playlist video to start at (default is 1)'},
    {'key': '--playlist-end', 'description': 'Playlist video to end at (default is last)'},
    {'key': '--playlist-items', 'description': 'Playlist video items to download. Specify indices of the videos in the playlist separated by commas like: "--playlist-items 1,2,5,8" if you want to download videos indexed 1, 2, 5, 8 in the playlist. You can specify range: "--playlist-items 1-3,7,10-13", it will download the videos at index 1, 2, 3, 7, 10, 11, 12 and 13.'},
    {'key': '--match-title', 'description': 'Download only matching titles (regex orcaseless sub-string)'},
    {'key': '--reject-title', 'description': 'Skip download for matching titles (regex orcaseless sub-string)'},
    {'key': '--max-downloads', 'description': 'Abort after downloading NUMBER files'},
    {'key': '--min-filesize', 'description': 'Do not download any videos smaller than SIZE (e.g. 50k or 44.6m)'},
    {'key': '--max-filesize', 'description': 'Do not download any videos larger than SIZE (e.g. 50k or 44.6m)'},
    {'key': '--date', 'description': 'Download only videos uploaded in this date'},
    {'key': '--datebefore', 'description': 'Download only videos uploaded on or before this date (i.e. inclusive)'},
    {'key': '--dateafter', 'description': 'Download only videos uploaded on or after this date (i.e. inclusive)'},
    {'key': '--min-views', 'description': 'Do not download any videos with less than COUNT views'},
    {'key': '--max-views', 'description': 'Do not download any videos with more than COUNT views'},
    {'key': '--match-filter', 'description': 'Generic video filter. Specify any key (seethe "OUTPUT TEMPLATE" for a list of available keys) to match if the key is present, !key to check if the key is not present, key > NUMBER (like "comment_count > 12", also works with >=, <, <=, !=, =) to compare against a number, key = \'LITERAL\' (like "uploader = \'Mike Smith\'", also works with !=) to match against a string literal and & to require multiple matches. Values which are not known are excluded unless you put a question mark (?) after the operator. For example, to only match videos that have been liked more than 100 times and disliked less than 50 times (or the dislike functionality is not available at the given service), but who also have a description, use --match-filter'},
    {'key': '--no-playlist', 'description': 'Download only the video, if the URL refers to a video and a playlist.'},
    {'key': '--yes-playlist', 'description': 'Download the playlist, if the URL refers to a video and a playlist.'},
    {'key': '--age-limit', 'description': 'Download only videos suitable for the given age'},
    {'key': '--download-archive', 'description': 'Download only videos not listed in the archive file. Record the IDs of all downloaded videos in it.'},
    {'key': '--include-ads', 'description': 'Download advertisements as well (experimental)'}
];

const download = [
    {'key': '-r', 'alt': '--limit-rate', 'description': 'Maximum download rate in bytes per second(e.g. 50K or 4.2M)'},
    {'key': '-R', 'alt': '--retries', 'description': 'Number of retries (default is 10), or "infinite".'},
    {'key': '--fragment-retries', 'description': 'Number of retries for a fragment (default is 10), or "infinite" (DASH, hlsnative and ISM)'},
    {'key': '--skip-unavailable-fragments', 'description': 'Skip unavailable fragments (DASH, hlsnative and ISM)'},
    {'key': '--abort-on-unavailable-fragment', 'description': 'Abort downloading when some fragment is not available'},
    {'key': '--keep-fragments', 'description': 'Keep downloaded fragments on disk after downloading is finished; fragments are erased by default'},
    {'key': '--buffer-size', 'description': 'Size of download buffer (e.g. 1024 or 16K) (default is 1024)'},
    {'key': '--no-resize-buffer', 'description': 'Do not automatically adjust the buffer size. By default, the buffer size is automatically resized from an initial value of SIZE.'},
    {'key': '--http-chunk-size', 'description': 'Size of a chunk for chunk-based HTTP downloading (e.g. 10485760 or 10M) (default is disabled). May be useful for bypassing bandwidth throttling imposed by a webserver (experimental)'},
    {'key': '--playlist-reverse', 'description': 'Download playlist videos in reverse order'},
    {'key': '--playlist-random', 'description': 'Download playlist videos in random order'},
    {'key': '--xattr-set-filesize', 'description': 'Set file xattribute ytdl.filesize with expected file size'},
    {'key': '--hls-prefer-native', 'description': 'Use the native HLS downloader instead of ffmpeg'},
    {'key': '--hls-prefer-ffmpeg', 'description': 'Use ffmpeg instead of the native HLS downloader'},
    {'key': '--hls-use-mpegts', 'description': 'Use the mpegts container for HLS videos, allowing to play the video while downloading (some players may not be able to play it)'},
    {'key': '--external-downloader', 'description': 'Use the specified external downloader. Currently supports aria2c,avconv,axel,curl,ffmpeg,httpie,wget'},
    {'key': '--external-downloader-args'}
];

const filesystem = [
    {'key': '-a', 'alt': '--batch-file', 'description': 'File containing URLs to download (\'-\' for stdin), one URL per line. Lines starting with \'#\', \';\' or \']\' are considered as comments and ignored.'},
    {'key': '--id', 'description': 'Use only video ID in file name'},
    {'key': '-o', 'alt': '--output', 'description': 'Output filename template, see the "OUTPUT TEMPLATE" for all the info'},
    {'key': '--autonumber-start', 'description': 'Specify the start value for %(autonumber)s (default is 1)'},
    {'key': '--restrict-filenames', 'description': 'Restrict filenames to only ASCII characters, and avoid "&" and spaces in filenames'},
    {'key': '-w', 'alt': '--no-overwrites', 'description': 'Do not overwrite files'},
    {'key': '-c', 'alt': '--continue', 'description': 'Force resume of partially downloaded files. By default, youtube-dl will resume downloads if possible.'},
    {'key': '--no-continue', 'description': 'Do not resume partially downloaded files (restart from beginning)'},
    {'key': '--no-part', 'description': 'Do not use .part files - write directlyinto output file'},
    {'key': '--no-mtime', 'description': 'Do not use the Last-modified header to set the file modification time'},
    {'key': '--write-description', 'description': 'Write video description to a .description file'},
    {'key': '--write-info-json', 'description': 'Write video metadata to a .info.json file'},
    {'key': '--write-annotations', 'description': 'Write video annotations to a.annotations.xml file'},
    {'key': '--load-info-json', 'description': 'JSON file containing the video information (created with the "--write-info-json" option)'},
    {'key': '--cookies', 'description': 'File to read cookies from and dump cookie jar in'},
    {'key': '--cache-dir', 'description': 'Location in the file system where youtube-dl can store some downloaded information permanently. By default $XDG_CACHE_HOME/youtube-dl or ~/.cache/youtube-dl . At the moment, only YouTube player files (for videos with obfuscated signatures) are cached, but that may change.'},
    {'key': '--no-cache-dir', 'description': 'Disable filesystem caching'},
    {'key': '--rm-cache-dir', 'description': 'Delete all filesystem cache files'}
];

const thumbnail = [
    {'key': '--write-thumbnail', 'description': 'Write thumbnail image to disk'},
    {'key': '--write-all-thumbnails', 'description': 'Write all thumbnail image formats to disk'},
    {'key': '--list-thumbnails', 'description': 'Simulate and list all available thumbnail formats'}
];

const verbosity = [
    {'key': '-q', 'alt': '--quiet', 'description': 'Activate quiet mode'},
    {'key': '--no-warnings', 'description': 'Ignore warnings'},
    {'key': '-s', 'alt': '--simulate', 'description': 'Do not download the video and do not writeanything to disk'},
    {'key': '--skip-download', 'description': 'Do not download the video'},
    {'key': '-g', 'alt': '--get-url', 'description': 'Simulate, quiet but print URL'},
    {'key': '-e', 'alt': '--get-title', 'description': 'Simulate, quiet but print title'},
    {'key': '--get-id', 'description': 'Simulate, quiet but print id'},
    {'key': '--get-thumbnail', 'description': 'Simulate, quiet but print thumbnail URL'},
    {'key': '--get-description', 'description': 'Simulate, quiet but print video description'},
    {'key': '--get-duration', 'description': 'Simulate, quiet but print video length'},
    {'key': '--get-filename', 'description': 'Simulate, quiet but print output filename'},
    {'key': '--get-format', 'description': 'Simulate, quiet but print output format'},
    {'key': '-j', 'alt': '--dump-json', 'description': 'Simulate, quiet but print JSON information. See the "OUTPUT TEMPLATE" for a description of available keys.'},
    {'key': '-J', 'alt': '--dump-single-json', 'description': 'Simulate, quiet but print JSON information for each command-line argument. If the URL refers to a playlist, dump the whole playlist information in a single line.'},
    {'key': '--print-json', 'description': 'Be quiet and print the video information as JSON (video is still being downloaded).'},
    {'key': '--newline', 'description': 'Output progress bar as new lines'},
    {'key': '--no-progress', 'description': 'Do not print progress bar'},
    {'key': '--console-title', 'description': 'Display progress in console title bar'},
    {'key': '-v', 'alt': '--verbose', 'description': 'Print various debugging information'},
    {'key': '--dump-pages', 'description': 'Print downloaded pages encoded using base64 to debug problems (very verbose)'},
    {'key': '--write-pages', 'description': 'Write downloaded intermediary pages to files in the current directory to debug problems'},
    {'key': '--print-traffic', 'description': 'Display sent and read HTTP traffic'},
    {'key': '-C', 'alt': '--call-home', 'description': 'Contact the youtube-dl server for debugging'},
    {'key': '--no-call-home', 'description': 'Do NOT contact the youtube-dl server for debugging'}
];

const workarounds = [
    {'key': '--encoding', 'description': 'Force the specified encoding (experimental)'},
    {'key': '--no-check-certificate', 'description': 'Suppress HTTPS certificate validation'},
    {'key': '--prefer-insecure', 'description': 'Use an unencrypted connection to retrieve information about the video. (Currently supported only for YouTube)'},
    {'key': '--user-agent', 'description': 'Specify a custom user agent'},
    {'key': '--referer', 'description': 'Specify a custom referer, use if the video access is restricted to one domain'},
    {'key': '--add-header', 'description': 'Specify a custom HTTP header and its value, separated by a colon \':\'. You can use this option multiple times'},
    {'key': '--bidi-workaround', 'description': 'Work around terminals that lack bidirectional text support. Requires bidiv or fribidi executable in PATH'},
    {'key': '--sleep-interval', 'description': 'Number of seconds to sleep before each download when used alone or a lower boundof a range for randomized sleep before each download (minimum possible number of seconds to sleep) when used along with --max-sleep-interval'},
    {'key': '--max-sleep-interval', 'description': 'Upper bound of a range for randomized sleep before each download (maximum possible number of seconds to sleep). Must only beused along with --min-sleep-interval'}
]

const video_format = [
    {'key': '-f', 'alt': '--format', 'description': 'Video format code, see the "FORMAT SELECTION" for all the info'},
    {'key': '--all-formats', 'description': 'Download all available video formats'},
    {'key': '--prefer-free-formats', 'description': 'Prefer free video formats unless a specific one is requested'},
    {'key': '-F', 'alt': '--list-formats', 'description': 'List all available formats of requested videos'},
    {'key': '--youtube-skip-dash-manifest', 'description': 'Do not download the DASH manifests and related data on YouTube videos'},
    {'key': '--merge-output-format', 'description': 'If a merge is required (e.g. bestvideo+bestaudio), output to given container format. One of mkv, mp4, ogg, webm, flv. Ignored if no merge is required'}
];

const subtitle = [
    {'key': '--write-sub', 'description': 'Write subtitle file'},
    {'key': '--write-auto-sub', 'description': 'Write automatically generated subtitle file (YouTube only)'},
    {'key': '--all-subs', 'description': 'Download all the available subtitles of the video'},
    {'key': '--list-subs', 'description': 'List all available subtitles for the video'},
    {'key': '--sub-format', 'description': 'Subtitle format, accepts formats preference, for example: "srt" or "ass/srt/best"'},
    {'key': '--sub-lang', 'description': 'Languages of the subtitles to download (optional) separated by commas, use --list-subs'}
];

const authentication = [
    {'key': '-u', 'alt': '--username', 'description': 'Login with this account ID'},
    {'key': '-p', 'alt': '--password', 'description': 'Account password. If this option is left out, youtube-dl will ask interactively.'},
    {'key': '-2', 'alt': '--twofactor', 'description': 'Two-factor authentication code'},
    {'key': '-n', 'alt': '--netrc', 'description': 'Use .netrc authentication data'},
    {'key': '--video-password', 'description': 'Video password (vimeo, smotri, youku)'}
];

const adobe_pass = [
    {'key': '--ap-mso', 'description': 'Adobe Pass multiple-system operator (TV provider) identifier, use --ap-list-mso'},
    {'key': '--ap-username', 'description': 'Multiple-system operator account login'},
    {'key': '--ap-password', 'description': 'Multiple-system operator account password. If this option is left out, youtube-dl will ask interactively.'},
    {'key': '--ap-list-mso', 'description': 'List all supported multiple-system operators'}
];

const post_processing = [
    {'key': '-x', 'alt': '--extract-audio', 'description': 'Convert video files to audio-only files (requires ffmpeg or avconv and ffprobe or avprobe)'},
    {'key': '--audio-format', 'description': 'Specify audio format: "best", "aac", "flac", "mp3", "m4a", "opus", "vorbis", or "wav"; "best" by default; No effect without -x'},
    {'key': '--audio-quality', 'description': 'Specify ffmpeg/avconv audio quality, insert a value between 0 (better) and 9 (worse)for VBR or a specific bitrate like 128K (default 5)'},
    {'key': '--recode-video', 'description': 'Encode the video to another format if necessary (currently supported:mp4|flv|ogg|webm|mkv|avi)'},
    {'key': '--postprocessor-args', 'description': 'Give these arguments to the postprocessor'},
    {'key': '-k', 'alt': '--keep-video', 'description': 'Keep the video file on disk after the post-processing; the video is erased by default'},
    {'key': '--no-post-overwrites', 'description': 'Do not overwrite post-processed files; the post-processed files are overwritten by default'},
    {'key': '--embed-subs', 'description': 'Embed subtitles in the video (only for mp4,webm and mkv videos)'},
    {'key': '--embed-thumbnail', 'description': 'Embed thumbnail in the audio as cover art'},
    {'key': '--add-metadata', 'description': 'Write metadata to the video file'},
    {'key': '--metadata-from-title', 'description': 'Parse additional metadata like song title/artist from the video title. The format syntax is the same as --output'},
    {'key': '--xattrs', 'description': 'Write metadata to the video file\'s xattrs (using dublin core and xdg standards)'},
    {'key': '--fixup', 'description': 'Automatically correct known faults of the file. One of never (do nothing), warn (only emit a warning), detect_or_warn (the default; fix file if we can, warn otherwise)'},
    {'key': '--prefer-avconv', 'description': 'Prefer avconv over ffmpeg for running the postprocessors'},
    {'key': '--prefer-ffmpeg', 'description': 'Prefer ffmpeg over avconv for running the postprocessors (default)'},
    {'key': '--ffmpeg-location', 'description': 'Location of the ffmpeg/avconv binary; either the path to the binary or its containing directory.'},
    {'key': '--exec', 'description': 'Execute a command on the file after downloading, similar to find\'s -exec syntax. Example: --exec'},
    {'key': '--convert-subs', 'description': 'Convert the subtitles to other format (currently supported: srt|ass|vtt|lrc)'}
];

export const args_info = {
    'uncategorized'  : {'label': 'Main'},
    'network'        : {'label': 'Network'},
    'geo_restriction': {'label': 'Geo Restriction'},
    'video_selection': {'label': 'Video Selection'},
    'download'       : {'label': 'Download'},
    'filesystem'     : {'label': 'Filesystem'},
    'thumbnail'      : {'label': 'Thumbnail'},
    'verbosity'      : {'label': 'Verbosity'},
    'workarounds'    : {'label': 'Workarounds'},
    'video_format'   : {'label': 'Video Format'},
    'subtitle'       : {'label': 'Subtitle'},
    'authentication' : {'label': 'Authentication'},
    'adobe_pass'     : {'label': 'Adobe Pass'},
    'post_processing': {'label': 'Post Processing'},
};

export const args = {
    'uncategorized'  : uncategorized,
    'network'        : network,
    'geo_restriction': geo_restriction,
    'video_selection': video_selection,
    'download'       : download,
    'filesystem'     : filesystem,
    'thumbnail'      : thumbnail,
    'verbosity'      : verbosity,
    'workarounds'    : workarounds,
    'video_format'   : video_format,
    'subtitle'       : subtitle,
    'authentication' : authentication,
    'adobe_pass'     : adobe_pass,
    'post_processing': post_processing
}
