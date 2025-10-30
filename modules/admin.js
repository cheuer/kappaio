var fs = require('fs'),
    _ = require('lodash');

module.exports = function (irc) {
    var db = irc.use(require('./db'));

    var admins = irc.config.admins || [];
    var cmdchar = irc.config.cmdchar || '$'

    var channelCommands = [
        "ignore",
        "help",
        "love",
        "maxfreq",
        "partake",
        "leave"
    ];

    var botChannel = '#' + irc.config.info.nick.toLowerCase()
    var botChannelCommands = [
        "summon"
    ];

    /**
     * @param {string} address
     */
    var isAdmin = exports.isAdmin = function isAdmin(address) {
        var f = admins.filter(function (a) {
            try {
                return address.match(a);
            } catch (e) {
                return false;
            }
        });
        return f.length;
    };

    function hasPermission(user, channel, cmd) {
        console.log('Checking permission for user: %s, channel: %s, command: %s', user, channel, cmd);
        console.log('Bot channel: %s, channel commands: %j, bot channel commands: %j', botChannel, channelCommands, botChannelCommands);
        if (isAdmin(user)) return true;
        if ('#' + user == channel && _.includes(channelCommands, cmd)) return true;
        if (channel == botChannel && _.includes(botChannelCommands, cmd)) return true;
        return false;
    }

    irc.on('privmsg', function (m) {
        // {
        //     raw: ':spleebie!spleebie@spleebie.tmi.twitch.tv PRIVMSG #spleebie :I still have to work tomorrow\r',
        //     source: 'spleebie!spleebie@spleebie.tmi.twitch.tv',
        //     cmd: 'PRIVMSG',
        //     user: {
        //       address: 'spleebie!spleebie@spleebie.tmi.twitch.tv',
        //       nick: 'spleebie',
        //       user: 'spleebie',
        //       host: 'spleebie.tmi.twitch.tv'
        //     },
        //     params: [ '#spleebie' ],
        //     target: '#spleebie',
        //     text: 'I still have to work tomorrow'
        // }
        if (m.text.length && m.text[0] == cmdchar) {
            var responder = {};

            var nochar = m.text.substr(1), which;
            which = nochar.split(' ');
            var sendto = m.target[0] == '#' ? m.target : m.user.nick;
            responder.respond = irc.send.bind(irc, 'privmsg', sendto);
            var args = which.slice(1);
            args.unshift(m);
            const cmd = which[0];

            if (!hasPermission(m.user.user, m.target, cmd)) {
                console.log('No permission: user: %s, channel: %s, command: %s', m.user.user, m.target, cmd);
                return;
            }

            if (cmd && typeof (cmds[cmd]) === 'function')
                cmds[cmd].apply(responder, args);
            else
                responder.respond('no such command: ' + cmd);
        }
    });


    function saveConfig() {
        delete irc.config['$0'];
        delete irc.config['_'];
        irc.supervisor({ save: JSON.stringify(irc.config, null, 4) });
    }
    var cmds = {};

    cmds.reload = function () {
        irc.supervisor({ reload: true });
    };

    cmds.admin = function (m, user) {
        userString = user += '!*'
        if (_.includes(irc.config.admins, userString)) {
            this.respond(user + ' is already an admin');
        } else {
            irc.config.admins.push(userString);
            this.respond('Admin added');
            saveConfig();
        }
    };

    cmds.join = function (m, chan) {
        if (chan[0] !== '#') chan = '#' + chan;
        if (!~irc.config.channels.indexOf(chan)) {
            irc.config.channels.push(chan);
            saveConfig();
            this.respond('Joining ' + chan);
        }
        irc.send('join', chan);
    };

    cmds.part = function (m, chan) {
        if (chan[0] !== '#') chan = '#' + chan;
        if (~irc.config.channels.indexOf(chan)) {
            irc.config.channels.splice(irc.config.channels.indexOf(chan), 1);
            saveConfig();
            this.respond('Leaving ' + chan);
        }
        irc.send('part', chan);
    };

    cmds.nolearn = function (m, chan) {
        if (chan[0] !== '#') chan = '#' + chan;
        if (!~irc.config.nolearnchannels.indexOf(chan)) {
            irc.config.nolearnchannels.push(chan);
            saveConfig();
            this.respond('Not learning from ' + chan);
        }
    };

    cmds.learn = function (m, chan) {
        if (chan[0] !== '#') chan = '#' + chan;
        if (~irc.config.nolearnchannels.indexOf(chan)) {
            irc.config.nolearnchannels.splice(irc.config.nolearnchannels.indexOf(chan), 1);
            saveConfig();
            this.respond('Learning from ' + chan);
        }
    };

    cmds.db = function (m, subcmd) {
        var self = this;
        var subcmds = {
            stats: function (m) {
                db(function (err, db) {
                    db.stats(function (err, stats) {
                        self.respond(JSON.stringify(stats));
                    });
                });
            }
        };
        if (subcmds[subcmd]) subcmds[subcmd](m);
    }

    cmds.get = function (m, jpath) {
        var path = jpath.split(/[\[\]\.]+/g);
        var c = irc.config;
        while (c && path.length)
            c = c[path.shift()];
        this.respond(JSON.stringify(c));
    };

    cmds.set = function (m, jpath, val) {
        var path = jpath.split(/[\[\]\.]+/g);
        var c = irc.config;
        while (c && path.length > 1)
            c = c[path.shift()];
        var last = path.shift();
        c[last] = JSON.parse(val);
        saveConfig();
        this.respond(last + ' = ' + JSON.stringify(c[last]));
    };

    cmds.ignore = function (m, user) {
        if (!user) {
            this.respond('Usage: ' + cmdchar + 'ignore <username>');
        }
        const pattern = user + "!*";
        if (!~irc.config.ignore.users.indexOf(pattern)) {
            irc.config.ignore.users.push(pattern);
            saveConfig();
            this.respond('Now ignoring ' + user);
        } else {
            this.respond('Already ignoring ' + user);
        }
    };

    cmds.help = function (m) {
        // love: this is a % chance that the bot will reply when addressed (says his name with or without @ symbol) (default 50%)
        // maxfreq: how many seconds must have passed since last reply (replying to someone addressing him ignores this) (default 180 seconds)
        // partake: the % chance that it will try to reply to any message sent (default 10%)
        this.respond('Commands:\
            $partake sets chance of replying to any message.\
            $love sets chance of replying when addressed.\
            $maxfreq sets # of seconds between posts (ignoring replies).\
            $ignore adds to the ignore list.\
            $leave makes me leave the channel.');
    };

    cmds.love = function (m, value) {
        if (!value || isNaN(parseInt(value))) {
            const currentVal = irc.config.ai.love[m.target.toLowerCase().slice(1)] || irc.config.ai.love.default
            this.respond('Usage: ' + cmdchar + 'love <number from 0 and 100>. Current: ' + currentVal);
            return;
        }
        const channel = m.target.slice(1);
        irc.config.ai.love[channel] = parseInt(value);
        saveConfig();
        this.respond('love set to ' + value);
    };

    cmds.maxfreq = function (m, value) {
        if (!value || isNaN(parseInt(value))) {
            const currentVal = irc.config.ai.maxfreq[m.target.slice(1)] || irc.config.ai.maxfreq.default || 180;
            this.respond('Usage: ' + cmdchar + 'maxfreq <number of seconds>. Current: ' + currentVal);
            return;
        }
        const channel = m.target.slice(1);
        irc.config.ai.maxfreq[channel] = parseInt(value);
        saveConfig();
        this.respond('maxfreq set to ' + value);
    };

    cmds.partake = function (m, value) {
        if (!value || isNaN(parseInt(value))) {
            const currentVal = irc.config.ai.partake[m.target.toLowerCase().slice(1)].probability || irc.config.ai.partake.default.probability || 10;
            this.respond('Usage: ' + cmdchar + 'partake <number from 0 to 100>. Current: ' + currentVal);
            return;
        }
        const channel = m.target.slice(1),
            partconf = _.clone(irc.config.ai.partake.default) || { probability: 10, traffic: 0 };
        partconf.probability = parseInt(value);
        irc.config.ai.partake[channel] = partconf;
        saveConfig();
        this.respond('partake set to ' + value);
    };

    cmds.leave = function (m) {
        const channel = m.target;
        if (~irc.config.channels.indexOf(channel)) {
            irc.config.channels.splice(irc.config.channels.indexOf(channel), 1);
            saveConfig();
            this.respond('Leaving ' + channel);
            irc.send('part', channel);
        }
    };

    cmds.summon = function (m) {
        if (irc.config.channels.length >= 50) {
            this.respond('Sorry, I\'m in too many channels already.');
            return;
        }
        const channel = '#' + m.user.user;
        if (!~irc.config.channels.indexOf(channel)) {
            irc.config.channels.push(channel);
            saveConfig();
            this.respond('Joining ' + channel);
            irc.send('join', channel);
        }
    };

    return cmds;

};
