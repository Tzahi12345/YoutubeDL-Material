
var express = require("express");
const { getLogs } = require("../controllers/logs");
var logRouter = express.Router();

logRouter.get('/', getLogs);

module.exports = logRouter;
