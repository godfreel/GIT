var io = require('socket.io').listen(1111);

//list of active pages for user
var userKeys = new Array();
//list of users for current page
var keyUsers = new Array();
//list of active users ids
var usersId  = new Array();
//array[userId] = array('bannedUserId1', ...)
var bannedUsers = new Array();
//array[userId] = array('bannedByUserId1', ...)
var bannedByUsers = new Array();

//array[userIdA] = array('chatId = userA+userB', ...)
//array[userIdB] = array('chatId = userA+userB', ...)
var activeChats = new Array();
//array[chatId] = array('userIdA', 'userIdB')
var chatMap2User = new Array();

//array[chatId] = array('message1', 'message2')
var chatHistory = new Array();

//array[userId] = userName
var usersNames = new Array();

//array[userId] = array('socketId1', ...)
var usersMapId2Socket = new Array();
//array[socketId] = userId
var usersMapSocket2Id = new Array();

var debugMode = 1;

var showServerEvents = 1;
var showServerFunctions = 1;
var showClientEvents = 1;
var showClientFunctions = 1;
var showUnknownTypes = 1;

const typeServerEvent = 1;
const typeServerFunction = 2;
const typeClientEvent = 3;
const typeClientFunction = 4;

// open the socket connection
io.set('log level', 1);
io.sockets.on('connection', function (socket) {
		
		socket.on('serverLogEvent', function(msg) {
            __log(msg,socket,typeClientEvent);
        });

        socket.on('serverLogFunction', function(msg) {
            __log(msg,socket,typeClientFunction);
        });

		//just stop server
		socket.on('serverStop', function() {
			process.exit();
		});
		
		//is called on page load
		socket.on('serverStart', function (user_id) {
			//new user, let client know about it
			if(getUserSockets(user_id) === false) {
				socket.emit('clientRegistration',true);
			//user exists, let client know about it
			} else {
				socket.emit('clientRegistration',false);
			}
		});
		
		//new user registration, socketId will be user as userID
		//TODO: create function for id generation
		socket.on('serverRegistration', function (name) {
			//register socket
			setUserSocket(socket.id, socket.id);
			//save name
			setUserName(socket.id, name);
			//send userId to client
			socket.emit('clientSetUserId',socket.id);
		});
		
		//map socket to userId, due to user may have many pages opened at the same time, each page = socketId
		socket.on('serverMapSocket', function (user_id) {
      		setUserSocket(user_id, socket.id);
      	});
		
		//main chat function - process message sending
		socket.on('serverSendMessage', function (data) {
                if(debugMode === 1) {
                	if(data.message == 'die') {
                		process.exit();
                	}
                }
                
                //TODO: add error hanglind for getting sender_id and reciver_sockets
                //TODO: add client error message function
                //sender socket
                socket_from = socket.id;
                //sender id
                user_from = getUserId(socket_from);
                //all users' sockets
                sockets_from = getUserSockets(user_from);
                
                //receiver socket
                sockets_to = getUserSockets(data.user_id);
                //receiver id
                user_to = data.user_id;

                //check if sender is blocked by receiver
                if(userIsBanned(user_from, user_to)) {
                	socket.emit('clientGerMessage', {
            			msg : 'You have been banned by this user',
                        user_to : user_to,
                        user_from: user_from
            		});
                	return false;
            	}
                
                //list of active chats is used when user goes not new page, he should see all chats that he had on previous page
                addToActiveChats(user_from, user_to);
                //add userName to message
                //TODO: link message to user ID, instead of adding name
				message = getUserName(user_from) + ': ' + data.message;
                
				//save to history
                addToChatHistory(user_from, user_to, message);
                
                //send message to all pages opened by receivers
                for(var key in sockets_to) {
                	socket_to = sockets_to[key];
                	io.sockets.socket(socket_to).emit('clientGetMessage', {
                			msg : message,
                			user_to : user_to,
                			user_from : user_from
                	});
                };
                
                //send message to all pages opened by sender
                for(var key in sockets_from) {
                	socket_from = sockets_from[key];
                	io.sockets.socket(socket_from).emit('clientGetMessage', {
                			msg : message,
                			user_to : user_to,
                			user_from : user_from
                	});
                };
        });

		//send message that user has closed chat room
		socket.on('serverChatClosed', function (target_user_id) {
			//TODO: send data to all user's sockets
            //receiver socket
            sockets_to = getUserSockets(target_user_id);
            //TODO: add error handling in case user does not exist
			//send message to all pages opened by receivers
            for(var key in sockets_to) {
            	socket_to = sockets_to[key];
            	io.sockets.socket(socket_to).emit('clientChatClosed', getUserId(socket.id));
            };
		});
		
		//send message that user has banned another user
        socket.on('serverChatBanned', function (target_user_id) {

        		//update globel array of banned users
        		banUser(target_user_id, getUserId(socket.id));
        		
        		
        		sockets_to = getUserSockets(target_user_id);
        		banned_by_id = getUserId(socket.id);
        		
        		banned_by_list = getBannedByList(target_user_id);
        		
        		//TODO: add error handling in case user does not exist
    			//send message to all pages opened by receivers
                for(var key in sockets_to) {
                	socket_to = sockets_to[key];
                	__toSocket(socket_to).emit('clientSetBannedByList',banned_by_list);
                    
                };
                
        		
                banned_users_list = getBannedUsersList(banned_by_id);
                //TODO: sent to all user's sockets
                socket.emit('clientSetBannedList', banned_users_list);
                socket.emit('clientChatBanned', socket.id);

        });
        
        //user closed page
        socket.on('disconnect', function () {

        	//TODO:
        	//-- check if user close all videos - send 'left chat' message
        	var userId = getUserId(socket.id);
        	removeUserSocket(userId, socket.id);
        	if(countUserSockets(userId) == 0) {
        		//get active chats
        		//send message that user left chat
        		var sockets = getLinkedSockets(userId);
        		if(sockets !== false) {

                    sockets.forEach(function (socket) {
        			    __toSocket(socket).emit('clientChatLeft', userId);
        	    	});
                }
        	}
        	
        	var rooms = io.sockets.manager.roomClients[socket.id];
                
        	if(debugMode == 1) {
        		console.log(rooms);
        	}
                
        	//send message to all users from the same room
        	for(var key in rooms) {
        		if(debugMode == 1) {
        			console.log('refresh room ' + key);
        		}
                        
        		var clients = io.sockets.clients(key);
        		var dataToSend = new Array();
        		clients.forEach(function(client){
        			user_id = getUserId(client.id);
        			user_name = getUserName(user_id);
        			dataToSend.push({ id : user_id, name : user_name });
        		});
        		//TODO: check if it works with multipley windows
        		io.sockets.in(key).emit('clientSetUsersList', dataToSend);
        	};
        });
        
        //add debug listener
        socket.on('serverAddDebugListener', function () {
            //add user to debug room
            socket.join('debug');
        });

        //join user to room based on pageId
        socket.on('serverAddPageId', function (key) {

        		if(debugMode == 1 && key == 'die') {
        			process.exit();
        		}
        	
        		//add user to room
        		socket.join(key);
        		
        		//get list of user for current roon
                var clients = io.sockets.clients(key);

                var dataToSend = new Array();
                clients.forEach(function(client){
                		user_id = getUserId(client.id);
                		user_name = getUserName(user_id);
                		dataToSend[user_id] = {id: user_id, name: user_name};
                });
                
                dataToSendReady = new Array();
                //it's not possible to send assoc array
                for(var i in dataToSend) {
                	dataToSendReady.push(dataToSend[i]);
                }
                io.sockets.in(key).emit('clientSetUsersList', dataToSendReady);
        });
        
        socket.on('serverGetActiveChats', function () {
        	__log('serverGetActiveChats() called', socket, typeServerEvent);

            var users = getLinkedUsers(getUserId(socket.id));
            __log(users, socket, typeServerEvent);
            socket.emit('clientSetActiveChats',users);
        });

});

/*
    type 1 - server events
    type 2 - server functions
    type 3 - client events
    type 4 - client functions
 */
function __log(msg, socket, type) {

    socket_id = socket.id;

    if(debugMode !== 1) {
        return true;
    }

    if(typeof(type)==='undefined') type = 1;

    var user_name = getUserNameBySocketId(socket_id)

    var prefix;

    switch(type)
    {
        case typeServerEvent:
            if(showServerEvents == 1)
                prefix = '[*** server event] [' + user_name + ']: ';
            break;
        case typeServerFunction:
            if(showServerFunctions == 1)
                prefix = '[+++ server func.] [' + user_name + ']: ';
        case typeClientEvent:
            if(showClientEvents == 1)
                prefix = '[!!! client event] [' + user_name + ']: ';
            break;
        case typeClientFunction:
            if(showClientEvents == 1)
                prefix = '[@@@ client func.] [' + user_name + ']: ';
            break;
        default:
            if(showUnknownTypes == 1)
                prefix = '[~~~ unknown type] [' + user_name + '] [' + type + ']: ';
            break;
    }

    console.log(prefix + msg);

    io.sockets.in('debug').emit('debugLog', {type: type, body: (prefix + msg), user_name: user_name});
}

function __toSocket(socket) {
	return io.sockets.socket(socket);
}

function getBannedUsersList(banned_by_id) {
	return bannedUsers[banned_by_id];
}

function getBannedByList(user_id) {
	return bannedByUsers[user_id];
}

function generateChatKey(id1, id2) {
	if(id1 < id1) {
		return id1 + '.' + id2;
	} else {
		return id2 + '.' + id1;
	}
}

function getUserId(socket_id) {
	if(usersMapSocket2Id[socket_id] !== undefined) {
		return usersMapSocket2Id[socket_id];
	} else {
		return false;
	}
}

function getUserSockets(user_id) {
	
	if(usersMapId2Socket[user_id] !== undefined) {
		return usersMapId2Socket[user_id];
	} else {
		return false;
	}
}

function setUserSocket(user_id, socket_id) {
	//check if user is not banned
    if(usersMapId2Socket[user_id] !== undefined) {
    	usersMapId2Socket[user_id][socket_id] = socket_id; 
    } else {
    	sockets = new Array();
    	sockets[socket_id] = socket_id;
    	usersMapId2Socket[user_id] = sockets;
    }
    usersMapSocket2Id[socket_id] = user_id;
}

function removeUserSocket(user_id, socket_id) {
	if(usersMapId2Socket[user_id] !== undefined && usersMapId2Socket[user_id][socket_id] !== undefined)
        delete usersMapId2Socket[user_id][socket_id];
	if(usersMapSocket2Id[socket_id] !== undefined) {
        delete usersMapSocket2Id[socket_id];
    }
}

function countUserSockets(user_id) {
	if(usersMapId2Socket[user_id] !== undefined) {
        return usersMapId2Socket[user_id].length;
    } else {
        return 0;
   }
}

function setUserName(user_id, name) {
	usersNames[user_id] = name;
}

function getUserName(user_id) {
	return usersNames[user_id];
}

function getUserNameBySocketId(socket_id) {
    var user_id = getUserId(socket_id);
    if(user_id !== false) {
        var name = getUserName(user_id);
        return name;
    } else {
        return false;
    }
}

function userIsBanned(user_id, banned_by_id) {
	
	//check if user is not banned
    if(bannedByUsers[user_id] !== undefined) {
    	//user is banned already
    	if(bannedByUsers[user_id].indexOf(banned_by_id) > -1) {
    		return true;
    	}
    }
    return false;
}

function banUser(user_id, banned_by_id) {
	if(bannedByUsers[user_id] !== undefined) {
        if(bannedByUsers[user_id].indexOf(banned_by_id) == -1) {
                bannedByUsers[user_id].push(banned_by_id);
        }

	} else {
        first_entry = new Array();
        first_entry.push(banned_by_id);
        bannedByUsers[user_id] = first_entry;
	}
	
	if(bannedUsers[banned_by_id] !== undefined) {
        if(bannedUsers[banned_by_id].indexOf(user_id) == -1) {
        	bannedUsers[banned_by_id].push(user_id);
        }

	 } else {
		first_entry = new Array();
        first_entry.push(user_id);
        bannedUsers[banned_by_id] = first_entry;
	 }
}

function getActiveChats(user_id) {

    if(activeChats[user_id] !== undefined) {
        return activeChats[user_id];
	} else {
		return false;
	}
}

function getLinkedUsers(user_id) {
	var chats = getActiveChats(user_id);
	if(chats === false) {
        return false;
    };
    var users = new Array();

	chats.forEach(function(chat) {
		users.push(chatMap2User[chat][user_id]);
	});
	return users;
}

function getLinkedSockets(user_id){
	
	var users = getLinkedUsers(user_id);

    if(users == false) {
        return false;
    }

    var sockets = new Array();
	users.forEach(function (user) {
		sockets.concat(getUserSockets(user));
	});
	return sockets;
}

function addToActiveChats(user_id_A, user_id_B) {
	
	chat_key = generateChatKey(user_id_A, user_id_B);

    __log('addToActiveChats', 0, typeServerFunction);
    __log('chat key = ' + chat_key, 0, typeServerFunction);

    //from
	if(activeChats[user_id_A] !== undefined) {
    	if(activeChats[user_id_A].indexOf(chat_key) == -1) {
    		activeChats[user_id_A].push(chat_key);
    	}
    } else {
    	chats = new Array();
    	chats.push(chat_key);
    	activeChats[user_id_A] = chats;
    }
    //to
	if(activeChats[user_id_B] !== undefined) {
    	if(activeChats[user_id_B].indexOf(chat_key) == -1) {
    		activeChats[user_id_B].push(chat_key);
    	}
    } else {
    	chats = new Array();
    	chats.push(chat_key);
    	activeChats[user_id_B] = chats;
    }
	
	//map chat to users
	users = new Array();
	//way to get user for left chat
	users[user_id_A] = user_id_B;
	users[user_id_B] = user_id_A;
	chatMap2User[chat_key] = users;
} 

function addToChatHistory(user_id_from, user_id_to, message) {
	
	user_name = getUserName(user_id_from);
	chat_key = generateChatKey(user_id_from, user_id_to);
	message = user_name + ': ' + message;
	
	if(chatHistory[chat_key] !== undefined) {
    	//TODO add date time
		chatHistory[chat_key].push(message);
    } else {
    	history = new Array();
    	history.push(message);
    	chatHistory[chat_key] = history;
    }
	
}

