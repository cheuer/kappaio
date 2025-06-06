#!/usr/bin/env node

var args = require('optimist').argv;
var ircee = require('ircee');
var cp = require('child_process');
var net = require('net');
var through = require('through');

var EventEmitter = require('events').EventEmitter;
var fs = require('fs');
var path = require('path');

var Config = require('../lib/config.js');

var configFile = path.resolve(process.cwd(), args._[0] || 'config.yaml');


const socketPath = '/tmp/triplie-' + process.pid + '.sock';
fs.existsSync(socketPath) && fs.unlinkSync(socketPath);


function connection(config) {
    var irc = ircee(),
        self = new EventEmitter();

    irc.config = config;
    irc.use(require('ircee/core'));

    var instream = through(),
        outstream = through();

    irc.instream = instream;
    irc.outstream = outstream;

    var pings = 0;
    function connect() {
        pings = 0;
        var connectOpts = {
            port: config.port,
            host: config.server,
        };
        if (config.vhost)
            connectOpts.localAddress = config.vhost;
        var socket = net.connect(connectOpts);
        socket.pipe(instream, { end: false });
        outstream.pipe(socket, { end: false });
        socket.pipe(irc, { end: false }).pipe(socket);
        socket.on('error', function (err) {
            console.log("socket error:", err, connectOpts);
        });
        socket.on('timeout', function () {
            if (++pings > 1) socket.destroy();
            else irc.send('PING', new Date().getTime());
        });
        socket.setTimeout(90 * 1000);
        socket.on('error', function (err) {
            console.log("Connection error", err);
        });
        socket.on('close', async function (err) {
            console.log("Connection closed, trying to reconnect...");
            irc.config = await refreshToken(irc.config);
            saveConfig(irc.config);
            setTimeout(connect, irc.config.reconnectDelay * 1000 || 15000);
        });
    }
    irc.on('pong', function () { --pings; });

    connect();
    return irc;
}


function saveConfig(config) {
    delete config['$0'];
    delete config['_'];
    Config.save(configFile, config);
}

async function refreshToken(config) {
    console.log('Refreshing token');
    try {
        const response = await fetch('https://id.twitch.tv/oauth2/token', {
            method: "POST",
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                client_id: config.client_id,
                client_secret: config.client_secret,
                grant_type: 'refresh_token',
                refresh_token: config.refresh_token
            })
        });
        const json = await response.json();
        console.log('response: ', json);
        config.info.pass = 'oauth:' + json.access_token;
        config.refresh_token = json.refresh_token;
    } catch (e) {
        console.error('Error refreshing token:', e);
    }

    return config;
}

function runChild(irc) {

    var ipcadr = { path: socketPath };
    if (process.platform.match(/^win/))
        ipcadr = { port: 0 };


    var config = Config.load(args),
        self = {},
        socket = null,
        ipc = net.createServer(function (cli) {
            console.log("parent: child process connected");
            irc.instream.pipe(cli, { end: false });
            cli.pipe(irc.outstream, { end: false });
            // Ignore client connection errors.
            // TODO: check if this is safe.
            cli.on('error', function () { });
        }), child;


    var child;

    if (ipcadr.path)
        ipc.listen(ipcadr.path, listenComplete);
    else {
        ipc.listen(ipcadr.port, listenComplete);
    }

    function listenComplete() {
        ipcadr.port = ipc.address().port;
        child = run(config);
    }

    irc.on('connect', function () {
        function childReady(k) {
            if (child)
                try {
                    return child.send({ connection: true });
                } catch (e) { }
            if (k < 10)
                setTimeout(childReady.bind(null, k + 1), 1000); // try again in 1s
        }
        childReady(0);
    });

    function run(config) {
        var child = cp.spawn('node', [
            //'--prof', '--debug', '--prof_lazy', '--log',
            //'--expose-gc',
            __dirname + '/../lib/child.js'],
            { env: process.env, stdio: [null, null, null, 'ipc'] });
        child.on('exit', function (c) {
            console.log("Child exit with status code", c, ", reloading");
            setTimeout(load, c ? 3000 : 1);
        });
        try {
            child.stdout.pipe(process.stdout);
            child.stderr.pipe(process.stderr);
        } catch (e) { }
        child.on('message', function (msg, handler) {
            if (msg.reload) reload();
            if (msg.save) Config.save(configFile, JSON.parse(msg.save));
            if (msg.load) load();
        });
        child.send({ init: true, config: config, ipc: ipcadr });
        return child;
    }

    function load() {
        try { config = Config.load(args); } catch (e) { }
        irc.config = config;
        child = run(config);
    }
    function reload() {
        try { child.kill('SIGKILL'); }
        catch (e) { }

    }

}


runChild(connection(Config.load(args)));
