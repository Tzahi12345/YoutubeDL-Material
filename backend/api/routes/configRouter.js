var express = require("express");
const { getConfig, setConfig } = require("../controllers/config");
var configRouter = express.Router();

configRouter.get('/', getConfig);
configRouter.post('/setConfig', setConfig);

module.exports = configRouter;
