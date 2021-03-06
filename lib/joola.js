if (process.env.NODE_ENV == 'production') {
  var config = require('config').prod;
}
else
  var config = require('config').dev;

var joolaio = require('joola.sdk');
var MongoClient = require('mongodb').MongoClient;

exports.beacon = function (collection, doc, callback) {
  var localdoc = doc;
  localdoc.timestamp = new Date();
  var joptions = {
    "host": config.joola.host,
    "APIToken": config.joola.apitoken
  }
  MongoClient.connect("mongodb://localhost:27017/" + config.mongo.dbname, function (err, db) {
    var Server = db.collection('servers');
    Server.insert(localdoc, {w: 1}, function (err, result) {
      db.close();
      if (!err) {
        joolaio.init(joptions, function (err, result) {
          if (!err) {
            joolaio.beacon.insert(collection, doc, function (err, pushedDocument) {
              if (!err)
                return callback(null, pushedDocument);
              else
                return callback(err);
            });
          }
          else
            return callback(err);
        });
      }
      else
        return callback(err);
    });
  });
}