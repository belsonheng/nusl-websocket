const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);
const amqp = require('amqp');
const jwtDecode = require('jwt-decode');

app.use(express.static(__dirname + '/node_modules'));
app.use(express.static(__dirname + '/public'));

app.get('/public/list', function(request, response) {
    response.sendFile(__dirname + '/public/list.html')
});

app.get('/:hostname', function(request, response) {
  response.sendFile(__dirname + '/public/index.html');
});

io.on('connection', function(socket) {
  var rabbitMQ = amqp.createConnection({ host: 'localhost' });
  var queue = null;
  var ip = (socket.request.headers['x-forwarded-for'] || socket.request.connection.remoteAddress).replace(/^.*:/, '');
  var hostname = socket.request.headers.referer.match(/[^/]*(?=(\/)?$)/)[0];
  console.log(ip + ' connected with hostname ' + hostname);
  
  rabbitMQ.once('ready', function() {
    socket.emit('message', hostname + ' connected to server ' + socket.id);
    queue = rabbitMQ.queue(hostname);
    queue.bind(hostname);
    queue.subscribe(function(message) {
      if (message['logout']) {
        console.log('user has signed out');
        socket.emit('expiry', Date.now());
      } 
      if (message['jwt']) {
        var timestamp = jwtDecode(message['jwt']).exp*1000;
        console.log(`jwt: ${message['jwt']}`);
        console.log(`expiry in ${timestamp} ms`);
        socket.emit('expiry', timestamp);
      }
    });
    
    socket.on('disconnect', function() {
      queue.unsubscribe(hostname);
      rabbitMQ.disconnect();
      console.log(`${hostname} disconnected`);  
    });
  });  
});

server.listen(process.env.PORT || 8888, function() {
  console.log('[x] nusl-websocket server started');
});
