const constants = require('./constants');

const io = require('socket.io').listen(8080);

const users = [];

const chatRooms = {};

const searchingHeap = [];

io.set('log level', 1);

const commonTags = (target, user) =>
  target.tags.filter( tag => {
    return user.tags.filter( userTag => userTag.name.toLowerCase() === tag.name.toLowerCase() ).length > 0;
  }).length;

const findCommonTagsUser = async user =>
  await [...searchingHeap]
    .sort( (target, nextTarget) => commonTags(nextTarget, user) - commonTags(target, user) )
    .filter( item => {
      return ((item !== user) && (commonTags(item, user) > 0 )) || null;
    } )[0];

const deleteFromSearch = user => searchingHeap.splice(searchingHeap.indexOf(user), 1);

const createChatRoom = (user_1, user_2) => {
  const room = {
    users:[user_1, user_2],
    messages: []
  };
  chatRooms[`${user_1.id}${user_2.id}`] = room;
  user_1.room = room;
  user_2.room = room;
};

const deleteChatRoom = room => {
  room.users.forEach( user => {
    user.room = null;
    user.status = constants.WAITING;
  } );
  delete chatRooms[`${room.users[0].id}${room.users[1].id}`];
};

const endChat = user => {
  if (user.room !== null) {
    user.room.users.forEach( roomUser => {
      const nowUser = io.sockets.sockets[roomUser.id];
      nowUser && nowUser.emit('endChat', { msg: `${nowUser.id === user.id ? null : 'User disconnected' }`});
    } );
    deleteChatRoom(user.room);
  }
};

io.sockets.on('connection', socket => {
  let user = {
    id: socket.id,
    tags: [],
    name: '',
    status: constants.WAITING,
    room: null
  };
  users.push(user);
  console.log('connect', users.length);
  const ID = (socket.id).toString().substr(0, 5);
  const time = (new Date).toLocaleTimeString();
  socket.json.send({'event': 'connected', 'name': ID, 'time': time});

  socket.on('findChat', msg => {
    user.name = msg.user.name;
    user.tags = msg.user.tags;
    searchingHeap.push(user);
    socket.json.send({
      'event': 'findChatInfoReceived',
      user: user,
      users: searchingHeap.length,
    });
    findCommonTagsUser(user).then(res => {
      if (!res) {
        //socket.emit('noUsers');
        //deleteFromSearch(user);
      } else {
        console.log('User Found: ', res);
        socket.emit('userFound', {
          user: res
        });
        io.sockets.sockets[res.id].emit('userFound', {
          user: user
        });
        deleteFromSearch(res);
        deleteFromSearch(user);
        createChatRoom(user, res);
      }
    });
    console.log(`user ${ID} is searching`);
  });

  socket.on('startChat', msg => {
    const room = chatRooms[`${user.id}${msg.pair.id}`] || chatRooms[`${msg.pair.id}${user.id}`];
    user.status = constants.READY;
    if( room.users.every( user => user.status === constants.READY )) {
      socket.emit('partnerIsReady');
      io.sockets.sockets[msg.pair.id].emit('partnerIsReady');
    }
  });

  socket.on('cancelSearch', () => {
    console.log(`user ${ID}'s search canceled`);
    deleteFromSearch(user);
  });

  socket.on('escapeChat', () => {
    endChat(user);
  });

  socket.on('message', msg => {
    const room = chatRooms[`${user.id}${msg.pair.id}`] || chatRooms[`${msg.pair.id}${user.id}`];
    const message = {
      id: room.messages.length,
      senderId: msg.senderId,
      text: msg.message.text,
      //attachments: []
    };
    room.messages.push(message);
    //socket.emit('message', message);
    io.sockets.sockets[msg.pair.id].emit('message', message);
  });

  socket.on('disconnect', () => {
    //io.sockets.json.send({'event': 'userSplit', 'name': ID, 'time': time});
    users.splice(users.indexOf(user), 1);
    deleteFromSearch(user);
    endChat(user);
    console.log('disconnect', users.length);
  });
});