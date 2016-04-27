var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);

io.on('connection', function(socket) {
   socket.on('bot message', function(msg) {
       console.log(msg);
       //io.emit('bot message', msg);
   });
   socket.on('notifyBot', function(msg) {
       console.log(msg);
       //io.emit('bot message', msg);
   });
});

http.listen(8000, function() {
    console.log("listening on *:8000");
});
