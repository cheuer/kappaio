var fs = require('fs');
var _ = require('lodash');

var emotes = JSON.parse(fs.readFileSync(__dirname + "/../data/emotes.json", "utf8"));
var forbidden = ["nazi", "hitler", "cp", "porn", "child", "fpl"];
const badwords = fs.readFileSync(__dirname + "/../data/badwords.txt", "utf8").toString().split(/\r?\n/);

emotes = _.filter(emotes, function (emot) {
  return emot && emot[0] === emot[0].toUpperCase() && emot !== emot.toUpperCase();
});

var exp = module.exports = {};
exp.count = function (message) {
  var count = 0;
  if (message) {
    emotes.forEach(function (emote) {
      var match = message.match(new RegExp("(\\b" + emote + "\\b)", "gi"));
      if (match)
        count += match.length;
    });
  }
  return count;
};

exp.hasForbidden = function (message) {
  const lower = message.toLowerCase();
  let has = false;
  forbidden.forEach(function (word) {
    if (lower.indexOf(word) != -1) {
      has = true;
    }
  });
  badwords.forEach(function (line) {
    if (line.trim().length === 0 || line.indexOf('#') === 0) {
      return;
    }
    if (message.match(new RegExp("\\b" + line + "\\b", "i"))) {
      has = true;
    }
  });
  return has;
};

exp.fix = function (message) {
  if (message) {
    message = message.toLowerCase();

    emotes.forEach(function (emote) {
      message = message.replace(new RegExp("(\\b" + emote.toLowerCase() + "\\b)", "g"), emote);
    });

    [...forbidden, ...badwords].forEach(function (word) {
      if (word.trim().length === 0 || word.indexOf('#') === 0) {
        return;
      }
      message = message.replace(new RegExp("(\\b" + word + "\\b)", "gi"), emotes[Math.floor(Math.random() * emotes.length)]);
    });

    // collapse whitespaces
    message = message.replace(/\s+/g, " ")
    message[0] = message[0].toUpperCase();

    if (message[0] === "!") {
      message = message.replace("! ", "!");
    }
  }

  return message;
};
