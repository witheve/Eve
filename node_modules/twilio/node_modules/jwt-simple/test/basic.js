var jwt = require('../index');
var expect = require('expect.js');

describe('method and property', function() {
  it('jwt has version property', function() {
    expect(jwt.version).to.be.a('string');
  });

  it('jwt has encode and decode method', function() {
    expect(jwt.encode).to.be.a('function');
    expect(jwt.decode).to.be.a('function');
  });
});

describe('encode and decode', function() {
  it('encode token', function() {
    var token = jwt.encode({ foo: 'bar' }, 'key');
    expect(token).to.be.a('string');
    expect(token.split('.')).to.have.length(3);
  });

  it('key is required', function() {
    var fn = jwt.encode.bind(null, { foo: 'bar' });
    expect(fn).to.throwException();
  });

  it('decode token', function() {
    var obj = { foo: 'bar' };
    var key = 'key';
    var token = jwt.encode(obj, key);
    var obj2 = jwt.decode(token, key);
    expect(obj2).to.eql(obj);
    expect(jwt.decode.bind(null, token, 'invalid_key')).to.throwException();
  });

  it('decode no verify', function() {
    var obj = { foo: 'bar' };
    var key = 'key';
    var token = jwt.encode(obj, key);
    var fn1 = jwt.decode.bind(null, token, null);
    var fn2 = jwt.decode.bind(null, token, null, true);
    expect(fn1).to.throwException();
    expect(fn2()).to.eql(obj);
  });
});
