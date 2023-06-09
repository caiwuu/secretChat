'use strict'

var https = require('https')
var http = require('http')
var fs = require('fs')
const path = require('path')

var express = require('express')
var multer = require('multer')
var serveIndex = require('serve-index')
var socketIo = require('socket.io')
var log4js = require('log4js')
const { log } = require('console')

log4js.configure({
  appenders: {
    file: {
      type: 'file',
      filename: 'app.log',
      layout: {
        type: 'pattern',
        pattern: '%r %p - %m',
      },
    },
  },
  categories: {
    default: {
      appenders: ['file'],
      level: 'debug',
    },
  },
})

var logger = log4js.getLogger()

var app = express()

var upload = multer({ dest: 'public/upload/' })
app.post('/upload', upload.single('file'), function (req, res, next) {
  var file = req.file
  console.log('文件类型：%s', file.mimetype)
  console.log('原始文件名：%s', file.originalname)
  console.log('文件大小：%s', file.size)
  console.log('文件保存路径：%s', file.path)
  var filename = file.path + '_' + file.originalname
  fs.rename(file.path, filename, function (err) {
    if (err) {
      res.send({ ret_code: '1', data: err.message })
    } else {
      console.log('-----', filename)
      res.send({ code: '0', data: filename.replace('public' + path.sep, '') })
    }
  })
})
app.use(serveIndex('./public'))
app.use(express.static('./public'))

var options = {
  key: fs.readFileSync('./cert/3545845_link.rongyiapi.com.key'),
  cert: fs.readFileSync('./cert/3545845_link.rongyiapi.com.pem'),
}

//https server
var https_server = https.createServer(options, app)
var http_server = http.createServer(app)
var sockio = socketIo.listen(http_server)
http_server.listen(3000, '0.0.0.0')
https_server.listen(443, '0.0.0.0')

//connection
sockio.sockets.on('connection', (socket) => {
  console.log('connection')
  socket.on('message', (room, data) => {
    console.log(socket.id, data)
    if (data === undefined) {
      return
    }
    // socket.emit('message', 'person3', socket.id, data)
    socket.to(room).emit('message1', room, socket.id, data) //房间内所有人,除自己外
  })

  //该函数应该加锁
  socket.on('join', (room) => {
    socket.join(room)

    var myRoom = sockio.sockets.adapter.rooms[room]
    var users = Object.keys(myRoom.sockets).length
    console.log(users)

    logger.log('the number of user in room is: ' + users)

    //在这里可以控制进入房间的人数,现在一个房间最多 2个人
    //为了便于客户端控制，如果是多人的话，应该将目前房间里
    //人的个数当做数据下发下去。
    if (users < 3) {
      socket.emit('joined', room, socket.id)
      /*
      if (users > 1) {
        socket.to(room).emit('otherjoin', room);//除自己之外
      }*/
    } else {
      socket.leave(room)
      socket.emit('full', room, socket.id)
    }
  })

  socket.on('leave', (room) => {
    console.log(room)
    var myRoom = sockio.sockets.adapter.rooms[room]
    if (myRoom) {
      var users = Object.keys(myRoom.sockets).length
      logger.log('the number of user in room is: ' + (users - 1))
    }

    socket.leave(room)
    socket.to(room).emit('bye', room, socket.id) //房间内所有人,除自己外
    socket.emit('leaved', room, socket.id)
  })
})
