var learner = require('../lib/learner'),
    replyer = require('../lib/replyer'),
    Partake = require('../lib/partake'),
    aiopts = require('../lib/pipeline/options.js'),
    emotes = require('../lib/emotes'),
    _ = require('lodash'),
    context = require('../lib/context');


var args = require('optimist').argv;
var Config = require('../lib/config.js');

function enoughLove(amount) {
    var love = Math.random() * 100,
        enough = love < amount;
    console.log("got love =", amount, "; need =", love.toFixed(0));
    return enough;
}

module.exports = function (irc) {
    var db = irc.use(require('./db'));
    var partake = Partake();
    var rochans = irc.config.readonlychannels || [];

    var isIgnoredUser = module.exports.isIgnoredUser = function (address) {
        var _ref;
        var ignoredUsers = ((_ref = irc.config.ignore) != null ? _ref['users'] : void 0) || [];
        var f = ignoredUsers.filter(function (a) {
            return address.match(a);
        });
        return f.length;
    };

    var allchans = _.union(irc.config.channels || [], irc.config.readonlychannels || []);

    db(dbready);

    function dbready(err, db) {

        var lastMessages = {};

        irc.on('privmsg', learnOrReply);

        var contexts = {};

        function learnOrReply(e) {
            if (e.text[0] == irc.config.cmdchar) return;
            if (e.user.nick == irc.config.info.nick) return;

            var now = new Date().getTime();
            let ignore = false, reasons = [];

            if (isIgnoredUser(e.source)) {
                ignore = true;
                reasons.push('ignored user');
            }

            if (e.text.toLowerCase().indexOf("your message was not sent") != -1) {
                ignore = true;
                reasons.push('message not sent');
            }

            if (emotes.count(e.text) > 2) {
                ignore = true;
                reasons.push('emotes');
            }

            if (emotes.hasForbidden(e.text)) {
                ignore = true;
                reasons.push('forbidden/badwords');
            }

            if (ignore) {
                console.log('Ignored message from ' + e.source + ': ' + reasons.join(', '));
                return;
            }

            var clnt = e.target.trim().toLowerCase();
            var ctx = contexts[clnt];
            if (!ctx)
                ctx = contexts[clnt] = context(aiopts.defaults(irc.config.ai).context.maxsize);

            var learn = learner(db, irc.config.ai);
            var text = e.text.trim().toLowerCase();

            if (text.indexOf(irc.config.info.nick) == 0)
                text = text
                    .replace(irc.config.info.nick, '')
                    .replace(/^[,:\s]+/, '');

            text = text.replace(/[^\w\s.,()!]/g, "").replace(/\s+/g, " ").toLowerCase();

            var aiconf = aiopts.defaults(irc.config.ai);

            var partconf = aiconf.partake[e.target.toLowerCase().substring(1)] || aiconf.partake.default || { probability: 10, traffic: 0 };
            var shouldPartake = e.target[0] == '#' &&
                partake.decide(e.target, partconf.probability, partconf.traffic);

            var wasAddressed = ~e.text.trim().toLowerCase()
                .indexOf(irc.config.info.nick.toLowerCase()),
                onChannel = e.target[0] == '#';

            var love = irc.config.ai.love.for[e.user.nick];
            if (null == love) love = irc.config.ai.love[e.target.toLowerCase().substring(1)];
            if (null == love) love = irc.config.ai.love.default;
            if (null == love) love = 100;

            var maxfreq = irc.config.ai.maxfreq[e.target.substring(1)] || irc.config.ai.maxfreq.default || 180;

            var lastMessage = lastMessages[e.target] || 0;
            var replyToMsg = (!onChannel || shouldPartake || (wasAddressed && enoughLove(love)))
                && !_.includes(rochans, e.target.toLowerCase())
                && (wasAddressed || (now - lastMessage) > maxfreq * 1000); // Time since last message > maxfreq

            var shouldLearn = text.split(' ').length >= 3
                && !_.includes(irc.config.nolearnchannels, clnt);

            ctx.push(text, Date.now());

            if (shouldLearn)
                learn(text, Date.now());

            if (!replyToMsg) {
                return null;
            }

            console.log('Trying to reply...');

            var timeout = 1;
            if (aiconf.sleep)
                timeout = (aiconf.sleep[0]
                    + Math.random() * (aiconf.sleep[1] - aiconf.sleep[0]))
                    * 1000;

            //console.log(e.user.nick, e.text);
            var reply = replyer(db, irc.config.ai);
            var sendto = onChannel ? e.target : e.user.nick;
            var prefix = wasAddressed && onChannel ? '@' + e.user.nick + ' ' : '';

            reply.bind(reply, ctx.get(), function (err, response) {
                if (err) {
                    console.error('Error in reply:', err);
                    return;
                }

                response = response || irc.config.default_response;
                response = emotes.fix(response);
                if (response) {
                    setTimeout(function () {
                        lastMessages[e.target] = now;
                        if (response.match(/^.action\s+/)) {
                            if (response.charCodeAt(response.length - 1) !== 1)
                                response += String.fromCharCode(1);
                            irc.send('privmsg', sendto, response);
                        } else {
                            irc.send('privmsg', sendto, prefix + response);
                        }
                        ctx.push(e.user.nick, prefix + response, Date.now());
                        console.log('Sent message to', sendto, ':', prefix + response);
                        db.history.put(e.target, e.user.nick, e.text, response);
                    }, timeout);
                }
            })();
        }
    };


    irc.on('connect', function () {
        var core = irc.use(require('ircee/core')),
            config = Config.load(args);
        core.login(config.info);
    });

    irc.on('001', function (e) {
        (allchans).forEach(function (c) {
            irc.send('join', c);
        });
    });
}
