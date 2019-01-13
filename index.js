const constants = require('./constants');

const io = require('socket.io').listen(8080);

const users = [];

const chatRooms = [];

const searchingHeap = [];

io.set('log level', 1);

const commonTags = (target, user) =>
  target.tags.filter( tag => {
    return user.tags.filter( userTag => userTag.name === tag.name ).length > 0;
  }).length;

const findCommonTagsUser = async user =>
  await [...searchingHeap]
    .sort( (target, nextTarget) => commonTags(nextTarget, user) - commonTags(target, user) )
    .filter( item => {
      console.log(item);
      console.log(commonTags(item, user));
      return ((item !== user) && (commonTags(item, user) > 0 )) || null;
    } )[0];

const deleteFromSearch = user => searchingHeap.splice(searchingHeap.indexOf(user), 1);

const createChatRoom = (user_1, user_2) => {
  chatRooms.push({
    id: chatRooms.length + 1,
    user_1,
    user_2,
    messages: []
  });
};

io.sockets.on('connection', socket => {
  let user = {
    id: socket.id,
    tags: [],
    name: '',
    status: constants.WAITING,
    rooms: []
  };
  users.push(user);
  console.log('connect', users.length);
  const ID = (socket.id).toString().substr(0, 5);
  const time = (new Date).toLocaleTimeString();
  // Посылаем клиенту сообщение о том, что он успешно подключился и его имя
  socket.json.send({'event': 'connected', 'name': ID, 'time': time});
  // Посылаем всем остальным пользователям, что подключился новый клиент и его имя
  socket.on('message', msg => {
    const time = (new Date).toLocaleTimeString();
    // Уведомляем клиента, что его сообщение успешно дошло до сервера
    socket.json.send({'event': 'messageSent', 'name': ID, 'text': msg, 'time': time});
    // Отсылаем сообщение остальным участникам чата
    socket.broadcast.json.send({'event': 'messageReceived', 'name': ID, 'text': msg, 'time': time})
  });

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
    console.log(msg.pair);
  });

  // При отключении клиента - уведомляем остальных
  socket.on('disconnect', () => {
    const time = (new Date).toLocaleTimeString();
    io.sockets.json.send({'event': 'userSplit', 'name': ID, 'time': time});
    users.splice(users.indexOf(user), 1);
    deleteFromSearch(user);
    console.log('disconnect', users.length);
  });
});