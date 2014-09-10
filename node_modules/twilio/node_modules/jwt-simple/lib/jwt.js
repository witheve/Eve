/*
 * jwt-simple
 *
 * JSON Web Token encode and decode module for node.js
 *
 * Copyright(c) 2011 Kazuhito Hokamura
 * MIT Licensed
 */

/**
 * module dependencies
 */
var crypto = require('crypto');


/**
 * support algorithm mapping
 */
var algorithmMap = {
  HS256: 'sha256',
  HS384: 'sha384',
  HS512: 'sha512'
};


/**
 * expose object
 */
var jwt = module.exports;


/**
 * version
 */
jwt.version = '0.1.0';

/**
 * Decode jwt 
 *
 * @param {Object} token
 * @param {String} key 
 * @param {Boolean} noVerify 
 * @return {Object} payload
 * @api public
 */
jwt.decode = function jwt_decode(token, key, noVerify) {
  // check seguments
  var segments = token.split('.');
  if (segments.length !== 3) {
    throw new Error('Not enough or too many segments');
  }

  // All segment should be base64
  var headerSeg = segments[0];
  var payloadSeg = segments[1];
  var signatureSeg = segments[2];

  // base64 decode and parse JSON
  var header = JSON.parse(base64urlDecode(headerSeg));
  var payload = JSON.parse(base64urlDecode(payloadSeg));

  if (!noVerify) {
    var signingMethod = algorithmMap[header.alg];
    if (!signingMethod) {
      throw new Error('Algorithm not supported');
    }
  
    // verify signature. `sign` will return base64 string.
    var signingInput = [headerSeg, payloadSeg].join('.');
    if (signatureSeg !== sign(signingInput, key, signingMethod)) {
      throw new Error('Signature verification failed');
    }
  }

  return payload;
};


/**
 * Encode jwt
 *
 * @param {Object} payload
 * @param {String} key 
 * @param {String} algorithm 
 * @return {String} token
 * @api public
 */
jwt.encode = function jwt_encode(payload, key, algorithm) {
  // Check key
  if (!key) {
    throw new Error('Require key');
  }

  // Check algorithm, default is HS256
  if (!algorithm) {
    algorithm = 'HS256';
  }

  var signingMethod = algorithmMap[algorithm];
  if (!signingMethod) {
    throw new Error('Algorithm not supported');
  }

  // header, typ is fixed value.
  var header = { typ: 'JWT', alg: algorithm };

  // create segments, all segment should be base64 string
  var segments = [];
  segments.push(base64urlEncode(JSON.stringify(header)));
  segments.push(base64urlEncode(JSON.stringify(payload)));
  segments.push(sign(segments.join('.'), key, signingMethod));
  
  return segments.join('.');
}


/**
 * private util functions
 */

function sign(input, key, method) {
  var base64str = crypto.createHmac(method, key).update(input).digest('base64');
  return base64urlEscape(base64str);
}

function base64urlDecode(str) {
  return new Buffer(base64urlUnescape(str), 'base64').toString();
}

function base64urlUnescape(str) {
  str += Array(5 - str.length % 4).join('=');
  return str.replace(/\-/g, '+').replace(/_/g, '/');
}

function base64urlEncode(str) {
  return base64urlEscape(new Buffer(str).toString('base64'));
}

function base64urlEscape(str) {
  return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
