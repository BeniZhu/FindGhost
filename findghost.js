var findghost = {
    userSleepTime: 2 * 60 * 1000,
    showMessageCount: 512,
    MESSAGE_TYPE: {
        SYSTEM: "系统消息",
        CHAT: "聊天消息",
        GAME: "游戏消息",
        PLAYER: "玩家发言",
    },
    GAME_ROLE: {
        PLAYER: "玩家",
        WHITE: "小白",
        OWNER: "法官"
    },
    GAME_STATUS: {
        NOT_START: "未开始",
        READY: "准备中",
        ONGOING: "进行中"
    },
    CAMP: {
        MAN: "人",
        GHOST: "鬼"
    },
    init: function(appid) {
        var config = {
            authDomain: appid + ".wilddog.com",
            syncURL: "https://" + appid + ".wilddogio.com"
        };
        wilddog.initializeApp(config);
    },
    handleError: function(error) {
        console.log(error);
    },
    getCurrentDate: function() {
        var currentDate = undefined;
        wilddog.sync().ref("/.info/serverTimeOffset").once('value', function(snapshot) {
            currentDate = (new Date).getTime() + snapshot.val();
        })
        while (currentDate) {
            return currentDate;
        }
    },
    formatDate: function(date) {
        return ("0" + date.getHours()).slice(-2) + ":" + ("0" + date.getMinutes()).slice(-2) + ":" + ("0" + date.getSeconds()).slice(-2) + " ";
    },
    user: {
        displayName: {
            get: function(user) {
                if (!user) {
                    var user = findghost.user.get();
                }
                if (user) {
                    var name = user.displayName;
                    if (name) {
                        return name;
                    }
                    return user.email.split('@')[0];
                }
            },
            set: function(displayName, callback) {
                var user = findghost.user.get();
                if (user) {
                    var oldDisplay = findghost.user.displayName.get();
                    wilddog.auth().currentUser.updateProfile({
                        displayName: displayName
                    }).then(function(user) {
                        findghost.hall.message.sendSystem("“" + oldDisplay + "”改名为“" + displayName + "”");
                        callback(user);
                    }).catch(function(error) {
                        findghost.handleError(error);
                        callback(undefined);
                    });
                }
            }
        },
        get: function() {
            return wilddog.auth().currentUser;
        },
        register: function(email, password, callback) {
            var user = findghost.user.get();
            if (!user) {
                wilddog.auth().createUserWithEmailAndPassword(email, password).then(function(user) {
                    findghost.hall.message.sendSystem("“" + user.email.split('@')[0] + "”" + "加入了游戏");
                    callback(user);
                }).catch(function(error) {
                    findghost.handleError(error);
                    callback(undefined);
                });
            }
        },
        login: function(email, password, callback) {
            var user = findghost.user.get();
            if (!user) {
                wilddog.auth().signInWithEmailAndPassword(email, password).then(function(user) {
                    findghost.hall.message.sendSystem("“" + user.displayName + "”" + "回来了");
                    callback(user);
                }).catch(function(error) {
                    findghost.handleError(error);
                    callback(undefined);
                });
            }
        },
        logout: function() {
            var user = findghost.user.get();
            if (user) {
                wilddog.auth().signOut().catch(function(error) {
                    findghost.handleError(error);
                });
            }
        },
        uid: {
            get: function() {
                var user = findghost.user.get();
                if (user) {
                    return user.uid;
                }
            },
        },
        updateCallback: function(callback) {
            wilddog.auth().onAuthStateChanged(callback);
        }
    },
    hall: {
        user: {
            clear: function() {
                var user = findghost.user.get();
                if (user) {
                    var currentDate = findghost.getCurrentDate();
                    wilddog.sync().ref("/hall/users/").once("value", function(snapshot) {
                        var users = snapshot.val();
                        for (uid in users) {
                            var date = users[uid].date;
                            var userDisplay = users[uid].displayName;
                            if (date + findghost.userSleepTime < currentDate) {
                                findghost.hall.out(uid, userDisplay);
                            }
                        }
                    });
                }
            },
            updateCallback: function(callback) {
                wilddog.sync().ref("/hall/users").on("value", callback);
            },
        },
        message: {
            send: function(uid, displayName, message, type, callback) {
                var currentDate = findghost.getCurrentDate();
                wilddog.sync().ref("/hall/message").child(currentDate).set({
                    "uid": uid,
                    "displayName": displayName,
                    "type": type,
                    "message": message,
                }).then(callback);
            },
            sendSystem: function(message, callback) {
                findghost.hall.message.send("", "", message, findghost.MESSAGE_TYPE.SYSTEM, callback);
            },
            sendGame: function(message, callback) {
                findghost.hall.message.send("", "", message, findghost.MESSAGE_TYPE.GAME, callback);
            },
            sendChat: function(message, callback) {
                var user = findghost.user.get();
                if (user) {
                    findghost.hall.message.send(user.uid, findghost.user.displayName.get(), message, findghost.MESSAGE_TYPE.CHAT, callback);
                }
            },
            sendPlayer: function(message, callback) {
                var user = findghost.user.get();
                if (user) {
                    findghost.hall.message.send(user.uid, findghost.user.displayName.get(), message, findghost.MESSAGE_TYPE.PLAYER, callback);
                }
            },
            updateCallback: function(callback) {
                wilddog.sync().ref("/hall/message").orderByKey().limitToLast(findghost.showMessageCount).on("value", callback);
            }
        },
        out: function(uid, displayName) {
            findghost.game.outOfGame(uid, displayName);
            wilddog.sync().ref("/hall/users/" + uid).remove();
            findghost.hall.message.sendSystem("“" + displayName + "”" + "离开了");
        },
        in : function(uid, displayName) {
            wilddog.sync().ref("/hall/users/").child(uid).set({
                "displayName": displayName,
                "date": wilddog.sync().ServerValue.TIMESTAMP
            });
        }
    },
    game: {
        role: {
            callback: undefined,
            set: function(uid, displayName, gameRole, callback) {
                wilddog.sync().ref("/game/users/").child(uid).set({
                    "displayName": displayName,
                    "role": gameRole
                }).then(callback);
            },
            get: function(callback) {
                var user = findghost.user.get();
                if (user) {
                    wilddog.sync().ref("/game/users/" + user.uid).once("value", function(snapshot) {
                        var result = snapshot.val();
                        if (result) {
                            callback(result.role);
                        } else {
                            callback(undefined);
                        }
                    })
                } else {
                    callback(undefined);
                }
            },
            player: {
                get: function(callback) {
                    wilddog.sync().ref("game/users").orderByChild("role").equalTo(findghost.GAME_ROLE.PLAYER).once('value', function(snapshot) {
                        callback(snapshot.val());
                    });
                },
                ready: function() {
                    // 在准备中或未开始状态下，登录用户可以提出加入游戏
                    var user = findghost.user.get();
                    if (user) {
                        findghost.game.status.get(function(status) {
                            if (status == findghost.GAME_STATUS.NOT_START || status == findghost.GAME_STATUS.READY) {
                                var uid = user.uid;
                                var displayName = findghost.user.displayName.get();
                                findghost.game.role.set(uid, displayName, findghost.GAME_ROLE.PLAYER, function() {
                                    findghost.game.status.set(findghost.GAME_STATUS.READY);
                                    findghost.hall.message.sendGame("“" + displayName + "”" + "要抓鬼");
                                });
                            }
                        });
                    }
                },
                updateCallback: function(callback) {
                    var playersListener = wilddog.sync().ref("game/users").orderByChild("role").equalTo(findghost.GAME_ROLE.PLAYER);
                    playersListener.on("value", function(snapshot) {
                        callback(snapshot.val());
                    });
                    return playersListener;
                }
            },
            white: {
                get: function(callback) {
                    wilddog.sync().ref("game/users").orderByChild("role").equalTo(findghost.GAME_ROLE.WHITE).once('value', function(snapshot) {
                        callback(snapshot.val());
                    });
                },
                ready: function() {
                    // 任何时候登录用户都可以提出当小白
                    var user = findghost.user.get();
                    if (user) {
                        var uid = user.uid;
                        var displayName = findghost.user.displayName.get();
                        findghost.game.role.set(uid, displayName, findghost.GAME_ROLE.WHITE, function() {
                            findghost.game.status.get(function(status) {
                                if (status && status == findghost.GAME_STATUS.NOT_START) {
                                    findghost.game.status.set(findghost.GAME_STATUS.READY);
                                }
                            })
                            findghost.hall.message.sendGame("“" + displayName + "”" + "要当小白");
                        });
                    }
                },
                updateCallback: function(callback) {
                    var whitesListener = wilddog.sync().ref("game/users").orderByChild("role").equalTo(findghost.GAME_ROLE.WHITE);
                    whitesListener.on("value", function(snapshot) {
                        callback(snapshot.val());
                    });
                    return whitesListener;
                },
            },
            owner: {
                get: function(callback) {
                    wilddog.sync().ref("/game/owner/").once("value", function(snapshot) {
                        callback(snapshot.val());
                    });
                },
                set: function(uid, displayName, callback) {
                    wilddog.sync().ref("/game/").child("owner").set({
                        uid: uid,
                        displayName: displayName
                    }).then(callback);
                },
                ready: function(manWord, ghostWord, callback) {
                    // 在准备中或未开始状态下，在没有法官的情况下，登录用户可以提出当法官
                    var user = findghost.user.get();
                    if (user) {
                        findghost.game.role.owner.get(function(ownerInfo) {
                            if (!ownerInfo) {
                                var uid = user.uid;
                                var displayName = findghost.user.displayName.get();
                                findghost.game.role.set(uid, displayName, findghost.GAME_ROLE.OWNER, function() {
                                    findghost.game.role.owner.set(uid, displayName, function() {
                                        findghost.game.words.set(manWord, ghostWord, function() {
                                            findghost.game.status.set(findghost.GAME_STATUS.READY);
                                            findghost.hall.message.sendGame("“" + displayName + "”" + "已经提交了词，要当法官");
                                            callback(true);
                                        });
                                    });
                                });
                            } else {
                                findghost.handleError("已经有法官了!");
                                callback(false);
                            }
                        })
                    }
                    callback(false);
                },
                remove: function(callback) {
                    wilddog.sync().ref("/game/owner").remove();
                    callback();
                },
            },
            updateCallback: function(callback) {
                var user = findghost.user.get();
                if (user) {
                    findghost.game.role.callback = wilddog.sync().ref("/game/users/" + user.uid + "/role");
                    findghost.game.role.callback.on("value", function(snapshot) {
                        callback(snapshot.val());
                    });
                } else {
                    callback(undefined);
                }
            },
            removeCallback: function() {
                if (findghost.game.role.callback) {
                    findghost.game.role.callback.off();
                }
            },
        },
        status: {
            set: function(status) {
                wilddog.sync().ref("/game/").child("status").set(status);
            },
            get: function(callback) {
                wilddog.sync().ref("/game/status").once('value', function(snapshot) {
                    var result = snapshot.val();
                    callback(result);
                });
            },
            updateCallback: function(callback) {
                wilddog.sync().ref("/game/status").on("value", function(snapshot) {
                    callback(snapshot.val());
                });
            }
        },
        user: {
            get: function(callback) {
                wilddog.sync().ref("/game/users").once('value', function(snapshot) {
                    callback(snapshot.val());
                });
            },
            updateCallback: function(callback) {
                wilddog.sync().ref("/game/users").orderByChild("role").on("value", function(snapshot) {
                    var users = snapshot.val();
                    callback(users);
                });
            }
        },
        words: {
            get: function(callback) {
                findghost.game.role.get(function(gameRole) {
                    switch (gameRole) {
                        case undefined:
                        case findghost.GAME_ROLE.WHITE:
                            callback(undefined);
                            break;
                        case findghost.GAME_ROLE.PLAYER:
                            findghost.game.camp.get(function(camp) {
                                switch (camp) {
                                    case findghost.CAMP.GHOST:
                                        wilddog.sync().ref("/game/words/ghostWord").once('value', function(snapshot) {
                                            callback(snapshot.val());
                                        });
                                        return
                                    case findghost.CAMP.MAN:
                                        wilddog.sync().ref("/game/words/manWord").once('value', function(snapshot) {
                                            callback(snapshot.val());
                                        });
                                        return
                                    case findghost.CAMP.GHOST:
                                    default:
                                        callback(undefined);
                                        return
                                }
                            });
                            break;
                        case findghost.GAME_ROLE.OWNER:
                            wilddog.sync().ref("/game/words/").once('value', function(snapshot) {
                                callback(snapshot.val());
                            });
                            break;
                    }
                });
            },
            set: function(manWord, ghostWord, callback) {
                findghost.game.role.get(function(role) {
                    if (role && role == findghost.GAME_ROLE.OWNER) {
                        wilddog.sync().ref("/game/").child("words").set({
                            manWord: manWord,
                            ghostWord: ghostWord
                        }).then(callback);
                    }
                })
            },
            remove: function(callback) {
                wilddog.sync().ref("/game/words").remove();
                callback();
            },
        },
        camp: {
            get: function(callback) {
                var user = findghost.user.get();
                if (user) {
                    wilddog.sync().ref("/game/camp/" + user.uid + "/camp").once('value', function(snapshot) {
                        var result = snapshot.val();
                        callback(result);
                    });
                }
                callback(undefined);
            },
            create: function(callback) {
                findghost.game.role.get(function(role) {
                    if (role && role == findghost.GAME_ROLE.OWNER) {
                        findghost.game.role.player.get(function(players) {
                            if (players) {
                                var playerList = [];
                                var playerCount = 0;
                                for (uid in players) {
                                    playerCount += 1;
                                    var displayName = players[uid].displayName;
                                    playerList.push([playerCount, uid, displayName]);
                                }

                                if (playerCount >= 3) {
                                    var ghostCount = Math.floor(playerCount * 0.4);
                                    var manCount = playerCount - ghostCount;
                                    var ghostList = [];
                                    while (ghostList.length < ghostCount) {
                                        var newGhostId = Math.floor(Math.random(1) * playerCount + 1);
                                        if (ghostList && ghostList.indexOf(newGhostId) < 0) {
                                            ghostList.push(newGhostId);
                                        }
                                    }

                                    for (var i = 0; i < playerList.length; i++) {
                                        var index = playerList[i][0];
                                        var uid = playerList[i][1];
                                        var displayName = playerList[i][2];
                                        var camp = undefined;
                                        if (ghostList.indexOf(index) < 0) {
                                            camp = findghost.CAMP.MAN;
                                        } else {
                                            camp = findghost.CAMP.GHOST;
                                        }

                                        wilddog.sync().ref("/game/camp/").child(uid).set({
                                            no: index,
                                            displayName: displayName,
                                            camp: camp,
                                            alive: true
                                        });
                                    }

                                    findghost.game.status.set(findghost.GAME_STATUS.ONGOING);
                                } else {
                                    findghost.handleError("人数不足，不能发牌");
                                }
                            } else {
                                findghost.handleError("人数不足，不能发牌");
                            }
                        });
                    }
                })
            },
            man: {
                get: function(callback) {
                    //TODO
                }
            },
            ghost: {
                get: function(callback) {
                    //TODO
                }
            }
        },
        kill: function(uid) {
            wilddog.sync().ref("/game/camp/" + uid).child("alive").set(false);
        },
        out: function(uid, displayName) {
            if (!uid || !displayName) {
                var user = findghost.user.get();
                if (user) {
                    uid = user.uid;
                    displayName = findghost.user.displayName.get();
                }
            }

            // ready player not play/owner not owner/ white not white
            // ongoing player:alive:run out and die;die:out with body white:alive:give up die:out with body owner: out because boring

            if (uid && displayName) {
                wilddog.sync().ref("/game/users/" + uid).once('value', function(snapshot) {
                    var result = snapshot.val();
                    if (result) {
                        findghost.game.role.owner.get(function(ownerInfo) {
                            if (ownerInfo) {
                                if (ownerInfo.uid == uid) {
                                    findghost.game.role.owner.remove(function() {
                                        findghost.hall.message.sendGame("“" + displayName + "”" + "不当法官了");
                                        findghost.game.words.remove(function() {});
                                    });
                                }
                            }
                        });
                        findghost.game.role.player.get(function(players) {
                            if (players) {
                                if (players.hasOwnProperty(uid)) {
                                    findghost.hall.message.sendGame("“" + displayName + "”" + "逃跑了");
                                    findghost.game.kill(uid);
                                }
                            }
                        })
                        wilddog.sync().ref("/game/users/" + uid).remove();
                        findghost.hall.message.sendGame("“" + displayName + "”" + "不玩了");
                        wilddog.sync().ref("/game/users").once("value", function(snapshot) {
                            var users = snapshot.val();
                            if (!users) {
                                findghost.game.status.set(findghost.GAME_STATUS.NOT_START);
                            }
                        });
                    }
                })
            }
        },
        outOfGame: function(uid, displayName) {
            if (!uid || !displayName) {
                var user = findghost.user.get();
                if (user) {
                    uid = user.uid;
                    displayName = findghost.user.displayName.get();
                }
            }
            if (uid && displayName) {
                wilddog.sync().ref("/game/users/" + uid).once('value', function(snapshot) {
                    var result = snapshot.val();
                    if (result) {
                        findghost.game.role.owner.get(function(ownerInfo) {
                            if (ownerInfo) {
                                if (ownerInfo.uid == uid) {
                                    findghost.game.role.owner.remove(function() {
                                        findghost.hall.message.sendGame("“" + displayName + "”" + "不当法官了");
                                        findghost.game.words.remove(function() {});
                                    });
                                }
                            }
                        });
                        findghost.game.role.player.get(function(players) {
                            if (players) {
                                if (players.hasOwnProperty(uid)) {
                                    findghost.hall.message.sendGame("“" + displayName + "”" + "逃跑了");
                                    findghost.game.kill(uid);
                                }
                            }
                        })
                        wilddog.sync().ref("/game/users/" + uid).remove();
                        findghost.hall.message.sendGame("“" + displayName + "”" + "不玩了");
                        wilddog.sync().ref("/game/users").once("value", function(snapshot) {
                            var users = snapshot.val();
                            if (!users) {
                                findghost.game.status.set(findghost.GAME_STATUS.NOT_START);
                            }
                        });
                    }
                })
            }
        },
    }
}