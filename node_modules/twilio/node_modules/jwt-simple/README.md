# node-jwt-simple

[JWT(JSON Web Token)](http://self-issued.info/docs/draft-jones-json-web-token.html) encode and decode module for node.js.

JWT is used by [Google In-App Payments](http://code.google.com/intl/en/apis/inapppayments/docs/index.html).

## Install

    $ npm install jwt-simple

## Usage

    var jwt = require('jwt-simple');
    var payload = { foo: 'bar' };
    var secret = 'xxx';

    // encode
    var token = jwt.encode(payload, secret);

    // decode
    var decoded = jwt.decode(token, secret);
    console.log(decoded); //=> { foo: 'bar' }
