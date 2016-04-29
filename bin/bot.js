'use strict';

var JarvisBot = require('../lib/jarvisbot');
var config = require('../config');

var token = process.env.BOT_API_KEY || config.bot_api;
var dbPath = process.env.BOT_DB_PATH;
var name = process.env.BOT_NAME;

var jarvisbot = new JarvisBot({
    token: token,
    dbPath: dbPath,
    name: name
});

jarvisbot.run();