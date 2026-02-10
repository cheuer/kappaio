var fs = require('fs');
var _ = require('lodash');

var emotes = JSON.parse(fs.readFileSync(__dirname + "/../data/emotes.json", "utf8"));
var forbidden = ["nazi", "hitler", "cp", "porn", "child", "fpl"];
const badwords = fs.readFileSync(__dirname + "/../data/badwords.txt", "utf8").toString().split(/\r?\n/);

emotes = _.filter(emotes);

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

var exp = module.exports = {};
exp.count = function (message) {
  var count = 0;
  if (message) {
    emotes.forEach(function (emote) {
      var match = message.match(new RegExp("(\\b" + escapeRegex(emote) + "\\b)", "gi"));
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
    message = message.replace(new RegExp(/([a-z][a-z0-9]{5}\d+)([a-z])([a-z0-9]*)/), "g"), function (_, p1, p2, p3) {
      return p1 + p2.toUpperCase() + p3;
    }

    emotes.forEach(function (emote) {
      message = message.replace(new RegExp("(\\b" + escapeRegex(emote.toLowerCase()) + "\\b)", "gi"), emote);
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
