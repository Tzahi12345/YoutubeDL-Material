var path = require('path');
var fs = require('fs-extra');
const { logger } = require('../services/logger_service');

function getLogs(req, res){
  let logs = null;

  logs_path = path.join('appdata', 'logs', 'combined.log')
  if (fs.existsSync(logs_path))
      logs = fs.readFileSync(logs_path, 'utf8');
  else
      logger.error(`Failed to find logs file at the expected location: ${logs_path}`)

  res.send({
      logs: logs,
      success: !!logs
  });
}



exports.getLogs = getLogs
