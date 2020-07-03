var config_api = require('../../config.js');
var path = require('path');
var fs = require('fs-extra');
var {logger, logger_transports} = require('./logger_service');

var validDownloadingAgents = [
  'aria2c',
  'avconv',
  'axel',
  'curl',
  'ffmpeg',
  'httpie',
  'wget'
];


var backendPort = null;
var usingEncryption = null;
var audioFolderPath = null;
var videoFolderPath = null;
var downloadOnlyMode = null;
var useDefaultDownloadingAgent = null;
var customDownloadingAgent = null;
var allowSubscriptions = null;
var subscriptionsCheckInterval = null;

// other needed values
var options = null; // encryption options
var url_domain = null;

function loadConfigValues() {
  url = !debugMode ? config_api.getConfigItem('ytdl_url') : 'http://localhost:4200';
  backendPort = config_api.getConfigItem('ytdl_port');
  console.log('we set backendport to', backendPort)
  usingEncryption = config_api.getConfigItem('ytdl_use_encryption');
  audioFolderPath = config_api.getConfigItem('ytdl_audio_folder_path');
  videoFolderPath = config_api.getConfigItem('ytdl_video_folder_path');
  downloadOnlyMode = config_api.getConfigItem('ytdl_download_only_mode');
  useDefaultDownloadingAgent = config_api.getConfigItem('ytdl_use_default_downloading_agent');
  customDownloadingAgent = config_api.getConfigItem('ytdl_custom_downloading_agent');
  allowSubscriptions = config_api.getConfigItem('ytdl_allow_subscriptions');
  subscriptionsCheckInterval = config_api.getConfigItem('ytdl_subscriptions_check_interval');

  if (!useDefaultDownloadingAgent && validDownloadingAgents.indexOf(customDownloadingAgent) !== -1 ) {
      logger.info(`Using non-default downloading agent \'${customDownloadingAgent}\'`)
  } else {
      customDownloadingAgent = null;
  }

  if (usingEncryption)
  {
      var certFilePath = path.resolve(config_api.getConfigItem('ytdl_cert_file_path'));
      var keyFilePath = path.resolve(config_api.getConfigItem('ytdl_key_file_path'));

      var certKeyFile = fs.readFileSync(keyFilePath);
      var certFile = fs.readFileSync(certFilePath);

      options = {
          key: certKeyFile,
          cert: certFile
      };
  }

  if (!url || url === '') url = 'http://example.com'
  url_domain = new URL(url);

  let logger_level = config_api.getConfigItem('ytdl_logger_level');
  const possible_levels = ['error', 'warn', 'info', 'verbose', 'debug'];
  if (!possible_levels.includes(logger_level)) {
      logger.error(`${logger_level} is not a valid logger level! Choose one of the following: ${possible_levels.join(', ')}.`)
      logger_level = 'info';
  }

  logger.level = logger_level;
  logger_transports.console.level = logger_level;
  logger.info(`Setting log level to ${logger_level}`);

}
loadConfigValues();

exports.loadConfigValues = loadConfigValues;
exports.url_domain = url_domain;
exports.options = options;
exports.backendPort = backendPort;
exports.usingEncryption = usingEncryption;
exports.audioFolderPath = audioFolderPath;
exports.videoFolderPath = videoFolderPath;
exports.downloadOnlyMode = downloadOnlyMode;
exports.useDefaultDownloadingAgent = useDefaultDownloadingAgent;
exports.customDownloadingAgent = customDownloadingAgent;
exports.allowSubscriptions = allowSubscriptions;
exports.subscriptionsCheckInterval = subscriptionsCheckInterval;
