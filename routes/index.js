var config = require('config').dev;
var joola = require('../lib/joola');
var common = require('../lib/common');
var linode = require('../lib/providers/linode');
var winston = require('winston');
var moment = require('moment');
var express = require('express');
var router = express.Router();
var MongoClient = require('mongodb').MongoClient;

function queue(userid) {
  common.queueServer('linode', userid, function (err) {
    if (!err) {
      winston.info("Server queued");
    }
    else {
      winston.error("[queueServer] " + err);
    }
  });
}
router.get('/', function (req, res) {
  var uuid = common.uuid();
  MongoClient.connect("mongodb://localhost:27017/" + config.mongo.dbname, function (err, db) {
    if (err)
      return res.json(500, {"error": "Could not connect to database"});
    var User = db.collection('users');
    User.insert({timestamp: new Date(), userid: uuid, dnsset: 0}, {w: 1}, function (err, result) {
      if (err)
        return res.json(500, {"error": "Could not insert user to database"});
      return res.render('index', { title: 'Fullnode.co - Adopt a full node', uuid: uuid });
    });
  });

});

router.get('/faq', function (req, res) {
  res.render('faq', { title: 'Fullnode.co - Adopt a full node' });
});

router.post('/dnscheck', function (req, res) {
  if (!req.body.dns)
    return res.json(500, {"error": "Missing parameter: dns"});
  var dns = req.body.dns;
  common.checkDNS(dns, function (err, result) {
    if (err) {
      return res.json(500, {"error": "Could not fetch DNS list"});
    }
    else {
      if (result) {
        return res.json(500, {"error": "DNS taken"});
      }
      else {
        return res.send(200);
      }
    }
  });
});

router.post('/callback', function (req, res) {
  if (req.query.secret == config.general.callbackSecret) {
    var order = req.body.order;
    var userid = req.body.order.custom;
    //dns = dns.replace(/[^a-z0-9\s]/gi, '').replace(/[_\s]/g, '-')
    if (order.status == "completed" && order.total_native.cents == config.providers.linode.price * 100) {
      MongoClient.connect("mongodb://localhost:27017/" + config.mongo.dbname, function (err, db) {
        if (err)
          return res.send(500);
        var sq = db.collection('serverqueue');
        var User = db.collection('users');
        User.update({userid: userid}, {$set: {paid: 1}}, function (err, result) {
          if (err)
            return res.send(500);
          sq.findOne({userid: userid}, function (err, result) {
            //This is a hack since Coinbase sometimes gets an error when calling the callback url. Coinbase will re-attempt any errored callbacks but we need to make sure the server was not already created.
            if (result)
              return res.send(200);
            queue(userid);
          });
          return res.send(200);
        });
      });
    }
    else
      return res.send(200);
  }
  else
    return res.send(403);
});

router.param('userid', function (req, res, next, id) {
  MongoClient.connect("mongodb://localhost:27017/" + config.mongo.dbname, function (err, db) {
    if (err)
      return res.json(500, {"error": "Could not connect to database"});
    var sq = db.collection('serverqueue');
    sq.findOne({userid: id, dnsset: 0}, function (err, result) {
      if (err)
        return res.json(403, {"error": "Could not search the database"});
      if (result) {
        req.userid = result.userid;
        return next();
      }
      else
        return res.json(403, {"error": "Could not find user"});
    });
  });
});

router.get('/dns/:userid', function (req, res) {
  if (req.userid)
    return res.render('dns', {userid: req.userid})
  else
    return res.json(403, {"error": "Could not find user"});
});

router.post('/setdns', function (req, res) {
  var dns = req.body.dns;
  dns = dns.replace(/[^a-z0-9\s]/gi, '').replace(/[_\s]/g, '-');
  MongoClient.connect("mongodb://localhost:27017/" + config.mongo.dbname, function (err, db) {
    if (err)
      return res.json(500, {"error": "Could not find a valid server for this user"});
    var server = db.collection('serverqueue');
    server.findOne({userid: req.body.userid, dnsset: 0}, function (err, result) {
      if (err)
        return res.json(500, {"error": "Could not find a valid server for this user"});
      common.setDNS(dns, result.ip, function (err) {
        if (err)
          return res.json(500, {"error": "Could not set DNS"});
        server.update({userid: req.body.userid, dnsset: 0}, {$set: {dnsset: 1}}, function (err, result) {
          if (err)
            return res.json(500, {"error": "Could not update dnsset=1"});
          return res.send(200);
        });
      });
    })
  });

});

module.exports = router;