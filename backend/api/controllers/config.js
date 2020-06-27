
var config_api = require('../../config.js');

function getConfig(req, res){
  let config_file = config_api.getConfigFile();
  res.send({
      config_file: config_file,
      success: !!config_file
  });
}

function setConfig(req, res){
  let new_config_file = req.body.new_config_file;
  if (new_config_file && new_config_file['YoutubeDLMaterial']) {
      let success = config_api.setConfigFile(new_config_file);
      loadConfigValues(); // reloads config values that exist as variables
      res.send({
          success: success
      });
  } else {
      logger.error('Tried to save invalid config file!')
      res.sendStatus(400);
  }
}


exports.getConfig = getConfig
exports.setConfig = setConfig
