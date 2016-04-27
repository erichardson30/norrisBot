var fork = require('child_process').fork;
var bot = fork('./bin/bot');
var server = fork('./server/server');