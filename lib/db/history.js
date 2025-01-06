function onError(err) {
    if (err) {
        console.log("Error in history query: ", err);
        throw err;
    }
}

module.exports = function (db, opt, cb) {
    var self = {};

    db.serialize(function () {
        db.run("CREATE TABLE IF NOT EXISTS history (id integer primary key, channel, user, prompt, response, created DEFAULT CURRENT_TIMESTAMP);",
            onError);

        var insert = db.prepare('INSERT INTO history(channel, user, prompt, response) VALUES (?, ?, ?, ?);', onError),
            getRandom = db.prepare('SELECT channel, user, prompt, response, created FROM history ORDER BY RANDOM() LIMIT 1;', onError);

        self.put = function put(channel, user, prompt, response, cb) {
            console.log('history put called');
            insert.run(channel, user, prompt, response, cb);
        };

        self.get = function get() {
            getRandom.run(null, cb)
        };

        self.close = function close() {
            insert.finalize();
            getRandom.finalize();
        };

        cb(null, self);
    });
}
