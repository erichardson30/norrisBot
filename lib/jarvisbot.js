'use strict';
var express = require('express');
var util = require('util');
var path = require('path');
var fs = require('fs');
var SQLite = require('sqlite3').verbose();
var Bot = require('slackbots');
var axios = require('axios');
var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var moment = require('moment');
var Schedules = require('../schedule/schedule.schema');
var mongoose = require('mongoose');
var Slack = require('node-slack-upload');
var config = require('../config');

/**
 * Constructor function. It accepts a settings object which should contain the following keys:
 *      token : the API token of the bot (mandatory)
 *      name : the name of the bot (will default to "JarvisBot")
 *      dbPath : the path to access the database (will default to "data/JarvisBot.db")
 *
 * @param {object} settings
 * @constructor
 *
 * @author Luciano Mammino <lucianomammino@gmail.com>
 */
var JarvisBot = function Constructor(settings) {
    var slack = new Slack(config.bot_api);
    this.settings = settings;
    this.settings.name = this.settings.name || 'JarvisBot';
    this.dbPath = settings.dbPath || path.resolve(__dirname, '..', 'data', 'jarvisbot.db');

    this.user = null;
    this.db = null;
    
    // MongoLab URI
    var mongoUri = 'mongodb://cardinal:Cardinal@ds030719.mlab.com:30719/jarvis';

    // CONNECT TO MONGOLAB
    mongoose.connect(mongoUri);

    var mlab = mongoose.connection;
    mlab.on('error', console.error.bind(console, 'connection error:'));
    mlab.once('open', function() {
    console.log('Connected to MongoLab Jarvis DB');
    });
    
    io.on('connection', function(socket) {
        var self = this;
        socket.on('bot message', function(msg) {
            console.log(msg);
            //io.emit('bot message', msg);
        });
        socket.on('notifyBot', function(msg) {
            console.log(msg);
            this._sendMessageToDefaultUser;
        });
        socket.on('image', function(img) {
            var buffer = new Buffer(img.buffer, 'base64');
            fs.writeFileSync('image.jpg', buffer);
            slack.uploadFile({
                file: fs.createReadStream(path.join(__dirname, '..', 'image.jpg')),
                channels: 'D12985JAW'
            }, function(err) {
                if (err) {
                    console.error(err);
                }
                else {
                    console.log('done');
                }
            });
        });
    });
    
};

// inherits methods and properties from the Bot constructor
util.inherits(JarvisBot, Bot);

/**
 * Run the bot
 * @public
 */
JarvisBot.prototype.run = function () {
    JarvisBot.super_.call(this, this.settings);

    this.on('start', this._onStart);
    this.on('message', this._onMessage);
};

/**
 * On Start callback, called when the bot connects to the Slack server and access the channel
 * @private
 */
JarvisBot.prototype._onStart = function () {
    this._loadBotUser();
    this._connectDb();
    this._firstRunCheck();
};

/**
 * On message callback, called when a message (of any type) is detected with the real time messaging API
 * @param {object} message
 * @private
 */
JarvisBot.prototype._onMessage = function (message) {
    if (this._isChatMessage(message) &&
        this._isChannelConversation(message) &&
        !this._isFromJarvisBot(message) &&
        this._isMentioningChuckNorris(message)
    ) {
        this._replyWithRandomJoke(message);
    }
    
    if ( this._isChatMessage(message) &&
        this._isDirectConversation(message) &&
        !this._isFromJarvisBot(message)
    ) {
        this._replyWithDirectMessage(message);
    }
};

JarvisBot.prototype._isDirectConversation = function (message) {
    return typeof message.channel === 'string' &&
        message.channel[0] === 'D';
};

JarvisBot.prototype._replyWithDirectMessage = function (message) {
    console.log("DIRECT MESSAGE REPLY");
    console.log(message.text);
    if (message.text.indexOf('expecting') == 5 && message.text.indexOf('at') > -1) {
        // user that sent message
        var user = message.user;
        
        // person user is expecting
        var person = /expecting (.*) at/.exec(message.text);
        person = person[1];
        
        // time user is expecting person to arrive
        var time = /at (.*)/.exec(message.text);
        time = time[1];
        
        // bot response
        var response = "Thank you, I will be looking out for them";
        
        // cardinal slack url
        // var url = 'https://slack.com/api/users.info?token='+ config.cardinal_slack_api + '&user='+user+'&pretty=1';
       
        // BEChat url
        var url = 'https://slack.com/api/users.info?token=' + config.bechat_slack_api + '&user=' + user + '&pretty=1'
        axios.get(url).then(function(response) {
            var date = new Date();
            var dateString = "0" + (date.getMonth() + 1) + "/" + date.getDate() + "/" + date.getFullYear() + " " + time;
            //format date
            date = moment(dateString, "MM/DD/YYYY HH:mm a");
            date = new Date(date);
            console.log(date);
            var schedule = new Schedules({
                real_name : response.data.user.real_name,
                userName : response.data.user.name,
                email : response.data.user.profile.email,
                userId : response.data.user.id,
                channel : message.channel,
                date : date,
                expecting : person
            });
            schedule.save(function(err, questions) {
                if(err) {
                    console.log(err);
                }
                console.log("Schedule was created.");
            });
            
        });
        this.postMessage(message.user, response, {as_user: true});
        io.emit('bot message', message);
    } else {
        var response = "I did not understand what you meant. Please fill in the blanks : 'I am expecting _______ at ______(AM/PM)'";
        this.postMessage(message.user, response, {as_user: true});
        console.log(message.channel);
    }
};

JarvisBot.prototype._sendMessageToDefaultUser = function (message) {
    console.log("sending message to user");
    this.postMessageToUser("erichardson", "Someone is waiting for you", {as_user: true});
}

/**
 * Replyes to a message with a random Joke
 * @param {object} originalMessage
 * @private
 */
JarvisBot.prototype._replyWithRandomJoke = function (originalMessage) {
    var self = this;
    self.db.get('SELECT id, joke FROM jokes ORDER BY used ASC, RANDOM() LIMIT 1', function (err, record) {
        if (err) {
            return console.error('DATABASE ERROR:', err);
        }

        var channel = self._getChannelById(originalMessage.channel);
        self.postMessageToChannel(channel.name, record.joke, {as_user: true});
        self.db.run('UPDATE jokes SET used = used + 1 WHERE id = ?', record.id);
    });
};

/**
 * Loads the user object representing the bot
 * @private
 */
JarvisBot.prototype._loadBotUser = function () {
    var self = this;
    this.user = this.users.filter(function (user) {
        return user.name === 'norris';
    })[0];
};

/**
 * Open connection to the db
 * @private
 */
JarvisBot.prototype._connectDb = function () {
    if (!fs.existsSync(this.dbPath)) {
        console.error('Database path ' + '"' + this.dbPath + '" does not exists or it\'s not readable.');
        process.exit(1);
    }

    this.db = new SQLite.Database(this.dbPath);
};

/**
 * Check if the first time the bot is run. It's used to send a welcome message into the channel
 * @private
 */
JarvisBot.prototype._firstRunCheck = function () {
    var self = this;
    self.db.get('SELECT val FROM info WHERE name = "lastrun" LIMIT 1', function (err, record) {
        if (err) {
            return console.error('DATABASE ERROR:', err);
        }

        var currentTime = (new Date()).toJSON();

        // this is a first run
        if (!record) {
            self._welcomeMessage();
            return self.db.run('INSERT INTO info(name, val) VALUES("lastrun", ?)', currentTime);
        }

        // updates with new last running time
        self.db.run('UPDATE info SET val = ? WHERE name = "lastrun"', currentTime);
    });
};

/**
 * Sends a welcome message in the channel
 * @private
 */
JarvisBot.prototype._welcomeMessage = function () {
    this.postMessageToChannel(this.channels[0].name, 'Hi guys, roundhouse-kick anyone?' +
        '\n I can tell jokes, but very honest ones. Just say `Chuck Norris` or `' + this.name + '` to invoke me!',
        {as_user: true});
};

/**
 * Util function to check if a given real time message object represents a chat message
 * @param {object} message
 * @returns {boolean}
 * @private
 */
JarvisBot.prototype._isChatMessage = function (message) {
    return message.type === 'message' && Boolean(message.text);
};

/**
 * Util function to check if a given real time message object is directed to a channel
 * @param {object} message
 * @returns {boolean}
 * @private
 */
JarvisBot.prototype._isChannelConversation = function (message) {
    return typeof message.channel === 'string' &&
        message.channel[0] === 'C';
};

/**
 * Util function to check if a given real time message is mentioning Chuck Norris or the JarvisBot
 * @param {object} message
 * @returns {boolean}
 * @private
 */
JarvisBot.prototype._isMentioningChuckNorris = function (message) {
    return message.text.toLowerCase().indexOf('chuck norris') > -1 ||
        message.text.toLowerCase().indexOf(this.name) > -1;
};

/**
 * Util function to check if a given real time message has ben sent by the JarvisBot
 * @param {object} message
 * @returns {boolean}
 * @private
 */
JarvisBot.prototype._isFromJarvisBot = function (message) {
    return message.user === this.user.id;
};

/**
 * Util function to get the name of a channel given its id
 * @param {string} channelId
 * @returns {Object}
 * @private
 */
JarvisBot.prototype._getChannelById = function (channelId) {
    return this.channels.filter(function (item) {
        return item.id === channelId;
    })[0];
};

http.listen(8000, function() {
    console.log("listening on *:8000");
});

module.exports = JarvisBot;