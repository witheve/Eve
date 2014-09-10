# 0.3.x Instructions

## Installation

Parts of node-twilio depend on [`express`](http://expressjs.com).

To install via npm:
    
    npm install twilio

To install by hand, download the module and create a symlink in `~/.node_libraries`

    $ ln -s /path/to/node-twilio ~/.node-libraries/twilio

Note: Previously, the npm package named `twilio` referred to 
[Aaron Blohowiak's Twilio helper library](http://github.com/aaronblohowiak/Twilio-Node). 
Due to Aaron's time constraints, he has let this package use the `twilio` name while he is
unable to work on that implementation.

## Usage

To start, you'll need to obtain a Twilio account. (http://twilio.com). This will give you a Twilio Account Sid and a Twilio Auth Key. Using these, you may start using node for complex, awesome telephony applications.

To really get down to business, check out [`the documentation`](https://github.com/sjwalter/node-twilio/wiki).

### API

#### Low-Level REST Api Client

`node-twilio` provides a low-level interface for making requests of Twilio. This functionality is contained in lib/rest-client.js, and maps pretty much one-to-one with the [`Twilio REST API documentation`](http://www.twilio.com/docs/api/2010-04-01/rest/).

Each method accepts a callback function that returns the HTTP response object resulting from the API request, as well as options specific to that call.

The low-level REST Api, whil helpful, is little more than a simple wrapper around the node HTTP library. It takes care of the HTTP Basic auth, ensuring all your parameters are serialized properly, unmarshalling the responses (which we use purely the JSON representation from Twilio), and letting you, the developer, use the responses. This is pretty boring. (Note: My saying 'this is pretty boring' is just a way for me to excuse myself from writing the documentation for the low-level client right now. I'll do it soon. The source is fairly well documented, and while I recognize documentation for *everything* is important, I just wanna skip over this part right now.)

#### High-Level Rest Api Client

`node-twilio` provides a high-level interface for dealing with Twilio requests and responses, and encapsulates all the functionality within EventEmitters. This means you can develop Twilio applications in node without worrying about or provisioning URIs for every request and response your application will make; It may be non-obvious from the description, but that is awesome.

In order to explain how great this is, I will use an example:

If you were to build a Twilio application in any language using any helper library other than this one, you'd wind up doing something like:

Twilio.makeOutgoingCall(toNumber, fromNumber, UriForCallback);

Then, you'd have to go out and ensure than UriForCallback is a real, provisioned URI, and you'd put either a script or a static Twiml file there, and Twilio would go and fetch it.

`node-twilio`, however, takes care of all of that provisioning for you, and represents all Twilio interacts as EventEmitters. Again, this is awesome. Here's an example:

First, we want to instantiate a new Twilo client object.
The constructor takes three parameters: the account SID and auth token, as well as
the hostname of the application server. (This is used to construct URIs to give Twilio.)

    var sys = require('sys'),
        TwilioClient = require('twilio').Client,
        client = new TwilioClient(ACCOUNT_SID, AUTH_TOKEN, MY_HOSTNAME);

Now that we have our client, let's get a PhoneNumber object using one of the 
phone numbers that we've provisioned through some other channel.
(Note: You can provision phone numbers very simply via the Low-Level REST API)
The phone number used here can be any sort of Twilio number. If it's an outgoing
caller ID, the object will only be able to make outgoing phone calls/SMS. If it's
a regular incoming number, it will be able to make/receive phone calls and SMS.

    var phone = client.getPhoneNumber('+16269239971');

We'll now setup our phone number. This goes out and requests the phone number
instance resource and fills in a data structure with this phone number's details.

    phone.setup(function() {
        
        // Alright, our phone number is set up. Let's, say, make a call:
        phone.makeCall('+18674451795', null, function(call) {
            
            // 'call' is an OutgoingCall object. This object is an event emitter.
            // It emits two events: 'answered' and 'ended'
            call.on('answered', function(reqParams, res) {
                
                // reqParams is the body of the request Twilio makes on call pickup.
                // For instance, reqParams.CallSid, reqParams.CallStatus.
                // See: http://www.twilio.com/docs/api/2010-04-01/twiml/twilio_request
                // res is a Twiml.Response object. This object handles generating
                // a compliant Twiml response.
                
                console.log('Call answered');
    
                // We'll append a single Say object to the response:
                res.append(new Twiml.Say('Hello, there!'));
    
                // And now we'll send it.
                res.send();
            });
            
            call.on('ended', function(reqParams) {
                console.log('Call ended');
            });
        });
    
        // But wait! What if our number receives an incoming SMS?
        phone.on('incomingSms', function(reqParams, res) {
            
            // As above, reqParams contains the Twilio request parameters.
            // Res is a Twiml.Response object.
            
            console.log('Received incoming SMS with text: ' + reqParams.Body);
            console.log('From: ' + reqParams.From);
        });
    
        // Oh, and what if we get an incoming call?
        phone.on('incomingCall', function(reqParams, res) {
            
            res.append(new Twiml.Say('Thanks for calling! I think you are beautiful!'));
            res.send();
        });
    });

To get going beyond the basics, check out [the documentation](https://github.com/sjwalter/node-twilio/wiki).

#### Notes

More documentation is forthcoming.

# License (MIT License)

Copyright (c) 2010 Stephen J. Walters <stephenwalters@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
