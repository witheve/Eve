var name = "userid" + "=";
var cookie = document.cookie.split(';');
var userid = "";
if (cookie[0].indexOf(name) == 0)
userid=cookie[0].substring(name.length,cookie[0].length);
// Check if the user has already logged in
if(userid == "") {
	// TODO Handle a user who isn't logged in.
	console.log("Session has not been authenticated.");
} else {
	// TODO Handle a user who is already logged in
	console.log("Browser already has a session");
}

AuthRocket.setInstanceUrl('https://evetest.e1.loginrocket.com/v1/');

$(function(){
  $('#login-form').submit(function(event){
    AuthRocket.authenticate({
      username: $('#login_username').val(),
      password: $('#login_password').val()
    }, arLoginHandler);
    return false;
  });
  function arLoginHandler(response){
    if (response.error) {
    	$("#login-errors").text(response.error);
    } else {
    	window.location = "http://192.168.137.38:8000/login.html?page=" + document.getElementById('login_submit').getAttribute('target')  + "&token=" + response.token;
    }
  };
});

$(function(){
  $('#signup-form').submit(function(event){
    AuthRocket.signup({
      username: $('#signup_username').val(),
      email: $('#signup_email').val(),
      password: $('#signup_password').val(),
      password_confirmation: $('#signup_password_confirmation').val()
    }, arSignupHandler);
    return false;
  });
  function arSignupHandler(response){
    if (response.error) {
    	$("#signup-errors").text(response.error);
    } else {
    	window.location = "http://192.168.137.38:8000/login.html?page=" + document.getElementById('signup_submit').getAttribute('target')  + "&token=" + response.token;
    }
  };
});